import { useState, useEffect, useCallback, useRef, useMemo, type DragEvent } from "react";
import { useSchematicStore } from "../store";
import { isSpeaker } from "../speakerSpec";
import {
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  CONNECTOR_LABELS,
  CONNECTOR_GROUPS,
  type SignalType,
  type ConnectorType,
  type Gender,
  type Port,
  type PortDirection,
  type PortNetworkConfig,
  type PortCapabilities,
  type AuxRow,
  type DeviceData,
  type DeviceNode,
  type DhcpServerConfig,
  type SlotDefinition,
} from "../types";
import { CONNECTORS_WITH_GENDER_VARIATION, DEFAULT_CONNECTOR, NETWORK_SIGNAL_TYPES, VIDEO_SIGNAL_TYPES, resolvePortGender, shouldDefaultMultiConnect } from "../connectorTypes";
import { getBundledTemplates, getCardsByFamily, checkSession, createDraft, createHandoff } from "../templateApi";
import { getTemplateDrift } from "../templateSync";
import LoginDialog from "./LoginDialog";
import CardCreatorDialog from "./CardCreatorDialog";
import TemplateSyncDialog from "./TemplateSyncDialog";
import { isValidIpv4, isValidSubnetMask, isValidVlan, findDuplicateIps } from "../networkValidation";
import IpInput from "./IpInput";
import FacePlateEditor from "./FacePlateEditor";
import type { FacePlateLayout } from "../types";
import { AUX_FIELD_GROUPS, normalizeAuxRows, resolveAuxiliaryLine, trimTrailingEmpty } from "../auxiliaryData";
import { deriveThermalBtuh } from "../thermal";
import { buildDeviceSuggestions } from "../deviceSuggestions";
import Combobox from "./ui/Combobox";
import TagInput from "./ui/TagInput";

const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);
const ALL_CONNECTOR_TYPES = (Object.keys(CONNECTOR_LABELS) as ConnectorType[]).sort(
  (a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]),
);

/** Grouped connector dropdown order — preserves CONNECTOR_GROUPS ordering, alphabetizes within each
 *  group, and sweeps any connector missing from CONNECTOR_GROUPS into "Other" so a new ConnectorType
 *  never silently disappears from the dropdown. */
const CONNECTOR_GROUP_ENTRIES: Array<[string, ConnectorType[]]> = (() => {
  const groups = Object.entries(CONNECTOR_GROUPS).map(
    ([name, list]) => [name, [...list].sort((a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]))] as [string, ConnectorType[]],
  );
  const grouped = new Set<ConnectorType>(groups.flatMap(([, list]) => list));
  const orphans = ALL_CONNECTOR_TYPES.filter((c) => !grouped.has(c));
  if (orphans.length > 0) {
    const otherIdx = groups.findIndex(([name]) => name === "Other");
    if (otherIdx >= 0) {
      groups[otherIdx] = [
        "Other",
        [...groups[otherIdx][1], ...orphans].sort((a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b])),
      ];
    } else {
      groups.push(["Other", orphans.sort((a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]))]);
    }
  }
  return groups;
})();

/** Signal tiles offered in the RIGHT-panel signal-type grid. The current port's signal is always
 *  included (so a rare/legacy signal still shows its tile) followed by the common AV signals. */
const COMMON_SIGNAL_CHOICES: SignalType[] = [
  "sdi", "hdmi", "ndi", "dante", "analog-audio", "aes", "madi", "usb",
  "ethernet", "fiber", "displayport", "hdbaset", "dmx", "power", "custom",
];

const DIRECTION_OPTIONS: Array<{ value: PortDirection; label: string; short: string }> = [
  { value: "input", label: "Input", short: "IN" },
  { value: "output", label: "Output", short: "OUT" },
  { value: "bidirectional", label: "Bi-dir", short: "I/O" },
  { value: "passthrough", label: "Pass", short: "PASS" },
];

const DIRECTION_SHORT: Record<PortDirection, string> = {
  input: "IN",
  output: "OUT",
  bidirectional: "I/O",
  passthrough: "PASS",
};

interface PortDraft {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  gender?: Gender;
  networkConfig?: PortNetworkConfig;
  addressable?: boolean;
  capabilities?: PortCapabilities;
  isMulticable?: boolean;
  channelCount?: number;
  multiConnect?: boolean;
  directAttach?: boolean;
  notes?: string;
  poeDrawW?: number;
  linkSpeed?: string;
  flipped?: boolean;
  // Passthrough-only fields
  rearConnectorType?: ConnectorType;
  rearGender?: Gender;
  frontConnectorType?: ConnectorType;
  frontGender?: Gender;
  inheritsSignal?: boolean;
}

function newPortDraft(direction: PortDirection): PortDraft {
  const signalType: SignalType = "sdi";
  const connectorType = DEFAULT_CONNECTOR[signalType];
  if (direction === "passthrough") {
    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: "",
      signalType: "custom",
      direction,
      inheritsSignal: true,
    };
  }
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    signalType,
    direction,
    connectorType,
    multiConnect: shouldDefaultMultiConnect(signalType, connectorType) || undefined,
  };
}

const MIME = "application/easyschematic-port";

export default function DeviceEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const syncDeviceFromTemplate = useSchematicStore((s) => s.syncDeviceFromTemplate);
  const edges = useSchematicStore((s) => s.edges);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const setCreatingNodeId = useSchematicStore((s) => s.setCreatingNodeId);
  const undo = useSchematicStore((s) => s.undo);
  const addCustomTemplate = useSchematicStore((s) => s.addCustomTemplate);
  const updateCustomTemplate = useSchematicStore((s) => s.updateCustomTemplate);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const templateHiddenSignals = useSchematicStore((s) => s.templateHiddenSignals);
  const currency = useSchematicStore((s) => s.currency);
  const setTemplateHiddenSignals = useSchematicStore((s) => s.setTemplateHiddenSignals);
  const templatePresets = useSchematicStore((s) => s.templatePresets);
  const setTemplatePreset = useSchematicStore((s) => s.setTemplatePreset);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);
  const tagSuggestions = useSchematicStore((s) => s.tagSuggestions);
  const fieldSuggestions = useSchematicStore((s) => s.fieldSuggestions);
  const recordSuggestions = useSchematicStore((s) => s.recordSuggestions);

  const node = nodes.find((n) => n.id === editingNodeId && n.type === "device") as DeviceNode | undefined;

  const suggestions = useMemo(
    () => buildDeviceSuggestions(nodes, { tagSuggestions, fieldSuggestions }),
    [nodes, tagSuggestions, fieldSuggestions],
  );

  const [label, setLabel] = useState("");
  const [shortName, setShortName] = useState("");
  const [icon, setIcon] = useState("");
  /** Tri-state per-instance toggle: undefined = inherit schematic default. */
  const [useShortName, setUseShortName] = useState<boolean | undefined>(undefined);
  const [wrapLabel, setWrapLabelState] = useState<boolean | undefined>(undefined);
  const [hostname, setHostname] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [category, setCategory] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [headerColor, setHeaderColor] = useState<string | undefined>(undefined);
  const [ports, setPorts] = useState<PortDraft[]>([]);

  /** Which port is open in the RIGHT config panel. null = empty state. */
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);

  // Port visibility local state
  const [showAllPorts, setShowAllPorts] = useState(false);
  const [hiddenPorts, setHiddenPorts] = useState<string[]>([]);
  const [portVisOpen, setPortVisOpen] = useState(false);

  // DHCP server config
  const [dhcpServer, setDhcpServer] = useState<DhcpServerConfig | undefined>(undefined);

  // Power fields
  const [powerDrawW, setPowerDrawW] = useState<number | undefined>(undefined);
  const [powerCapacityW, setPowerCapacityW] = useState<number | undefined>(undefined);
  const [voltage, setVoltage] = useState<string | undefined>(undefined);
  const [thermalBtuh, setThermalBtuh] = useState<number | undefined>(undefined);
  const [poeBudgetW, setPoeBudgetW] = useState<number | undefined>(undefined);
  const [poeDrawW, setPoeDrawW] = useState<number | undefined>(undefined);

  // Cost
  const [unitCost, setUnitCost] = useState<number | undefined>(undefined);

  // Physical dimensions
  const [heightMm, setHeightMm] = useState<number | undefined>(undefined);
  const [widthMm, setWidthMm] = useState<number | undefined>(undefined);
  const [depthMm, setDepthMm] = useState<number | undefined>(undefined);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);

  // Loudspeaker acoustic spec — drives the plan-view coverage wedge + SPL estimates
  const [speakerSensitivityDb, setSpeakerSensitivityDb] = useState<number | undefined>(undefined);
  const [speakerMaxPowerW, setSpeakerMaxPowerW] = useState<number | undefined>(undefined);
  const [speakerCoverageAngleDeg, setSpeakerCoverageAngleDeg] = useState<number | undefined>(undefined);

  // Cable accessory flags
  const [isCableAccessory, setIsCableAccessory] = useState(false);
  const [integratedWithCable, setIntegratedWithCable] = useState(false);
  const [isVenueProvided, setIsVenueProvided] = useState(false);
  const [adapterVisibility, setAdapterVisibility] = useState<"default" | "force-show" | "force-hide">("default");

  // Search terms — raw string kept as-is so commas can be typed freely; parsed to array at save
  const [searchTermsRaw, setSearchTermsRaw] = useState("");

  // Auxiliary data rows — each row carries its own header/footer slot.
  const [auxiliaryData, setAuxiliaryData] = useState<AuxRow[]>([]);
  const [auxFieldMenuIdx, setAuxFieldMenuIdx] = useState<number | null>(null);
  const auxInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const auxMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (auxFieldMenuIdx === null) return;
    const onDown = (e: MouseEvent) => {
      if (!auxMenuRef.current) return;
      if (!auxMenuRef.current.contains(e.target as Node)) setAuxFieldMenuIdx(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [auxFieldMenuIdx]);

  // Login dialog for community submission
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  // Face-plate editor
  const [showFacePlateEditor, setShowFacePlateEditor] = useState(false);

  // Drag state — which port is being dragged and where it would drop
  const [draggedPortId, setDraggedPortId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ direction: PortDirection; index: number } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing props to local editor state */
  useEffect(() => {
    if (!node) return;
    const tpl = node.data.templateId
      ? getBundledTemplates().find((t) => t.id === node.data.templateId)
      : undefined;
    setLabel(node.data.label);
    setShortName(node.data.shortName ?? "");
    setIcon(node.data.icon ?? "");
    setUseShortName(node.data.useShortName);
    setWrapLabelState(node.data.wrapLabel);
    setHostname(node.data.hostname ?? "");
    setDeviceType(node.data.deviceType);
    setManufacturer(node.data.manufacturer ?? "");
    setModelNumber(node.data.modelNumber ?? "");
    setReferenceUrl(node.data.referenceUrl ?? tpl?.referenceUrl ?? "");
    setCategory(node.data.category ?? tpl?.category ?? "");
    setColor(node.data.color);
    setHeaderColor(node.data.headerColor);
    const loadedPorts = node.data.ports.map((p) => ({
      id: p.id,
      label: p.label,
      signalType: p.signalType,
      direction: p.direction,
      section: p.section,
      connectorType: p.connectorType,
      gender: p.gender,
      networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
      capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      isMulticable: p.isMulticable,
      channelCount: p.channelCount,
      multiConnect: p.multiConnect,
      directAttach: p.directAttach,
      notes: p.notes,
      poeDrawW: p.poeDrawW,
      linkSpeed: p.linkSpeed,
      flipped: p.flipped,
      addressable: p.addressable,
      rearConnectorType: p.rearConnectorType,
      rearGender: p.rearGender,
      frontConnectorType: p.frontConnectorType,
      frontGender: p.frontGender,
      inheritsSignal: p.inheritsSignal,
    }));
    setPorts(loadedPorts);
    setSelectedPortId(loadedPorts.length > 0 ? loadedPorts[0].id : null);
    setShowAllPorts(node.data.showAllPorts ?? false);
    setHiddenPorts(node.data.hiddenPorts ?? []);
    setPortVisOpen(false);
    setDhcpServer(node.data.dhcpServer ? { ...node.data.dhcpServer } : undefined);
    setPowerDrawW(node.data.powerDrawW);
    setPowerCapacityW(node.data.powerCapacityW);
    setVoltage(node.data.voltage);
    setThermalBtuh(node.data.thermalBtuh);
    setPoeBudgetW(node.data.poeBudgetW);
    setPoeDrawW(node.data.poeDrawW);
    setUnitCost(node.data.unitCost);
    setHeightMm(node.data.heightMm);
    setWidthMm(node.data.widthMm);
    setDepthMm(node.data.depthMm);
    setWeightKg(node.data.weightKg);
    setSpeakerSensitivityDb(node.data.speakerSensitivityDb);
    setSpeakerMaxPowerW(node.data.speakerMaxPowerW);
    setSpeakerCoverageAngleDeg(node.data.speakerCoverageAngleDeg);
    setIsCableAccessory(node.data.isCableAccessory ?? false);
    setIntegratedWithCable(node.data.integratedWithCable ?? false);
    setIsVenueProvided(node.data.isVenueProvided ?? false);
    setAdapterVisibility(node.data.adapterVisibility ?? "default");
    setAuxiliaryData(normalizeAuxRows(node.data.auxiliaryData));
    setSearchTermsRaw((node.data.searchTerms ?? []).join(", "));
    setSerialNumber(node.data.serialNumber ?? "");
    setTags(node.data.tags ?? []);
  }, [node]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = useCallback(() => {
    // Read live store state — a stale closure here would make handleSave
    // (which clears creatingNodeId just before calling close) trigger the
    // provisional-undo branch and revert the user's just-saved data.
    const { editingNodeId: eId, creatingNodeId: cId } = useSchematicStore.getState();
    if (eId && eId === cId) {
      // Provisional node — user cancelled without saving, undo the addDevice
      undo();
      setCreatingNodeId(null);
    }
    setEditingNodeId(null);
  }, [undo, setCreatingNodeId, setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;

    // Build old→new ID map for draft ports
    const idMap = new Map<string, string>();
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => {
        const newId = p.id.startsWith("draft-") ? `p${Date.now()}-${i}` : p.id;
        if (newId !== p.id) idMap.set(p.id, newId);
        return { ...p, id: newId, label: p.label.trim() };
      });

    // Remap and prune stale IDs from hiddenPorts
    const finalPortIds = new Set(finalPorts.map((p) => p.id));
    const finalHiddenPorts = hiddenPorts
      .map((id) => idMap.get(id) ?? id)
      .filter((id) => finalPortIds.has(id));

    // Preserve existing metadata fields from the node
    const existing = node?.data;
    const data: DeviceData = {
      label: label.trim() || "Untitled",
      ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
      ...(useShortName !== undefined ? { useShortName } : {}),
      ...(wrapLabel !== undefined ? { wrapLabel } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      deviceType: deviceType.trim() || "custom",
      ports: finalPorts,
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(modelNumber.trim() ? { modelNumber: modelNumber.trim() } : {}),
      ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(existing?.templateId ? { templateId: existing.templateId } : {}),
      ...(existing?.templateVersion ? { templateVersion: existing.templateVersion } : {}),
      ...(existing?.layerId ? { layerId: existing.layerId } : {}),
      ...(existing?.groupId ? { groupId: existing.groupId } : {}),
      ...(existing?.hostDeviceId ? { hostDeviceId: existing.hostDeviceId } : {}),
      // rotationDeg (placement/aim) is set via the plan-view rotate/aim handle, not this form — preserve it.
      ...(existing?.rotationDeg !== undefined ? { rotationDeg: existing.rotationDeg } : {}),
      // Loudspeaker acoustic spec — edited via the "Loudspeaker / Coverage" inputs below.
      ...(speakerSensitivityDb != null ? { speakerSensitivityDb } : {}),
      ...(speakerMaxPowerW != null ? { speakerMaxPowerW } : {}),
      ...(speakerCoverageAngleDeg != null ? { speakerCoverageAngleDeg } : {}),
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
      ...(headerColor ? { headerColor } : {}),
      ...(existing?.model ? { model: existing.model } : {}),
      ...(showAllPorts ? { showAllPorts: true } : {}),
      ...(finalHiddenPorts.length > 0 ? { hiddenPorts: finalHiddenPorts } : {}),
      // Always persist dhcpServer if set (preserves range config when toggling off)
      ...(dhcpServer ? { dhcpServer } : {}),
      ...(powerDrawW != null ? { powerDrawW } : {}),
      ...(powerCapacityW != null ? { powerCapacityW } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
      ...(voltage ? { voltage } : {}),
      ...(thermalBtuh != null ? { thermalBtuh } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(heightMm != null ? { heightMm } : {}),
      ...(widthMm != null ? { widthMm } : {}),
      ...(depthMm != null ? { depthMm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(isCableAccessory ? { isCableAccessory: true } : {}),
      ...(integratedWithCable ? { integratedWithCable: true } : {}),
      ...(isVenueProvided ? { isVenueProvided: true } : {}),
      ...(adapterVisibility !== "default" ? { adapterVisibility } : {}),
      ...(existing?.baseLabel ? { baseLabel: existing.baseLabel } : {}),
      ...(existing?.slots ? { slots: existing.slots } : {}),
      ...((() => {
        const trimmed = trimTrailingEmpty(auxiliaryData);
        return trimmed.some((r) => r.text.trim()) ? { auxiliaryData: trimmed } : {};
      })()),
      ...(() => { const t = searchTermsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20); return t.length > 0 ? { searchTerms: t } : {}; })(),
      // Per-instance identity fields — preserved/rebuilt so editor saves don't wipe them.
      ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      // No editor UI yet — carry through opaquely (like groupId) so saves don't drop them.
      ...(existing?.layoutSvgAssetId ? { layoutSvgAssetId: existing.layoutSvgAssetId } : {}),
      ...(existing?.zoneId ? { zoneId: existing.zoneId } : {}),
    };
    updateDevice(editingNodeId, data);
    // Persist any newly-introduced field values / tags as document suggestions.
    recordSuggestions({
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(deviceType.trim() ? { deviceType: deviceType.trim() } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    });
    setCreatingNodeId(null); // commit the node — close won't undo it
    close();
  }, [editingNodeId, ports, label, shortName, icon, useShortName, wrapLabel, hostname, deviceType, manufacturer, modelNumber, referenceUrl, category, serialNumber, tags, color, headerColor, node, updateDevice, recordSuggestions, close, setCreatingNodeId, showAllPorts, hiddenPorts, dhcpServer, powerDrawW, powerCapacityW, voltage, thermalBtuh, poeBudgetW, poeDrawW, unitCost, heightMm, widthMm, depthMm, weightKg, isCableAccessory, integratedWithCable, isVenueProvided, adapterVisibility, speakerSensitivityDb, speakerMaxPowerW, speakerCoverageAngleDeg, auxiliaryData, searchTermsRaw]);

  // Ctrl+Enter anywhere in the editor → Apply & Close
  const onCtrlEnter = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    }
  }, [handleSave]);

  const handleSaveAsTemplate = useCallback(() => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    const trimmedAux = trimTrailingEmpty(auxiliaryData);
    const existing = node?.data;

    // A template captures the device SPEC only. Per-placement/instance fields —
    // rotationDeg, layerId, groupId, hostDeviceId, position — are intentionally NOT
    // carried over (DeviceTemplate has no such fields; do not spread node.data here).
    addCustomTemplate({
      id: `custom-${Date.now()}`,
      deviceType: deviceType.trim() || "custom",
      label: label.trim() || "Custom Device",
      ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
      ports: finalPorts,
      ...(color ? { color } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(modelNumber.trim() ? { modelNumber: modelNumber.trim() } : {}),
      ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      ...(powerDrawW != null ? { powerDrawW } : {}),
      ...(powerCapacityW != null ? { powerCapacityW } : {}),
      ...(voltage ? { voltage } : {}),
      ...(thermalBtuh != null ? { thermalBtuh } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(heightMm != null ? { heightMm } : {}),
      ...(widthMm != null ? { widthMm } : {}),
      ...(depthMm != null ? { depthMm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(isVenueProvided ? { isVenueProvided: true } : {}),
      // Convert InstalledSlot[] back to the blueprint SlotDefinition[] that DeviceTemplate
      // expects — card selections are per-placement, not part of the template spec.
      ...(existing?.slots && existing.slots.length > 0
        ? {
            slots: existing.slots.map((s) => ({
              id: s.slotId,
              label: s.label,
              slotFamily: s.slotFamily ?? "",
              ...(s.cardTemplateId ? { defaultCardId: s.cardTemplateId } : {}),
            })),
          }
        : {}),
      ...(existing?.slotFamily ? { slotFamily: existing.slotFamily as string } : {}),
      ...(trimmedAux.some((r) => r.text.trim()) ? { auxiliaryData: trimmedAux } : {}),
      ...(() => { const t = searchTermsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20); return t.length > 0 ? { searchTerms: t } : {}; })(),
    });
  }, [ports, label, shortName, hostname, addCustomTemplate, node, powerDrawW, powerCapacityW, voltage, thermalBtuh, poeBudgetW, poeDrawW, unitCost, heightMm, widthMm, depthMm, weightKg, isVenueProvided, deviceType, color, manufacturer, modelNumber, referenceUrl, category, auxiliaryData, searchTermsRaw]);

  const handleUpdateUserTemplate = useCallback(() => {
    if (!node?.data.templateId) return;
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));
    const trimmedAux = trimTrailingEmpty(auxiliaryData);
    const existing = node.data;
    updateCustomTemplate(node.data.templateId, {
      id: node.data.templateId,
      deviceType: deviceType.trim() || "custom",
      label: label.trim() || "Custom Device",
      ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
      ports: finalPorts,
      ...(color ? { color } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(modelNumber.trim() ? { modelNumber: modelNumber.trim() } : {}),
      ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      ...(powerDrawW != null ? { powerDrawW } : {}),
      ...(powerCapacityW != null ? { powerCapacityW } : {}),
      ...(voltage ? { voltage } : {}),
      ...(thermalBtuh != null ? { thermalBtuh } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(heightMm != null ? { heightMm } : {}),
      ...(widthMm != null ? { widthMm } : {}),
      ...(depthMm != null ? { depthMm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(isVenueProvided ? { isVenueProvided: true } : {}),
      ...(existing.slots && existing.slots.length > 0
        ? {
            slots: existing.slots.map((s) => ({
              id: s.slotId,
              label: s.label,
              slotFamily: s.slotFamily ?? "",
              ...(s.cardTemplateId ? { defaultCardId: s.cardTemplateId } : {}),
            })),
          }
        : {}),
      ...(existing.slotFamily ? { slotFamily: existing.slotFamily as string } : {}),
      ...(trimmedAux.some((r) => r.text.trim()) ? { auxiliaryData: trimmedAux } : {}),
      ...(() => { const t = searchTermsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20); return t.length > 0 ? { searchTerms: t } : {}; })(),
    });
    handleSave();
  }, [node, ports, label, shortName, hostname, updateCustomTemplate, powerDrawW, powerCapacityW, voltage, thermalBtuh, poeBudgetW, poeDrawW, unitCost, heightMm, widthMm, depthMm, weightKg, isVenueProvided, deviceType, color, manufacturer, modelNumber, referenceUrl, category, auxiliaryData, searchTermsRaw, handleSave]);

  const handleSubmitToCommunity = useCallback(async () => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    if (finalPorts.length === 0) return;

    const existing = node?.data;
    let dt = deviceType.trim() || "custom";
    if (dt.startsWith("custom-")) dt = "";

    const trimmedAux = trimTrailingEmpty(auxiliaryData);

    const draftData: Record<string, unknown> = {
      label: label.trim() || "Custom Device",
      ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
      deviceType: dt,
      ports: finalPorts,
      ...(color ? { color } : {}),
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(modelNumber.trim() ? { modelNumber: modelNumber.trim() } : {}),
      ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(existing?.slots ? { slots: existing.slots } : {}),
      ...(existing?.slotFamily ? { slotFamily: existing.slotFamily } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      ...(powerDrawW != null ? { powerDrawW } : {}),
      ...(powerCapacityW != null ? { powerCapacityW } : {}),
      ...(voltage ? { voltage } : {}),
      ...(thermalBtuh != null ? { thermalBtuh } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(heightMm != null ? { heightMm } : {}),
      ...(widthMm != null ? { widthMm } : {}),
      ...(depthMm != null ? { depthMm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(isVenueProvided ? { isVenueProvided: true } : {}),
      ...(trimmedAux.some((r) => r.text.trim()) ? { auxiliaryData: trimmedAux } : {}),
      ...(() => { const t = searchTermsRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20); return t.length > 0 ? { searchTerms: t } : {}; })(),
    };

    const devicesUrl = import.meta.env.VITE_DEVICES_URL ?? "https://devices.easyschematic.live";

    const user = await checkSession();
    if (!user) {
      // Save to localStorage and show login dialog
      localStorage.setItem("easyschematic-pending-submission", JSON.stringify({
        data: draftData,
        timestamp: Date.now(),
      }));
      setShowLoginDialog(true);
      return;
    }

    try {
      const draftId = await createDraft(draftData);
      let url = `${devicesUrl}/#/submit?draft=${draftId}`;
      try {
        const authToken = await createHandoff();
        url += `&auth=${authToken}`;
      } catch { /* cookie domain should handle it */ }
      window.open(url, "_blank");
    } catch (e) {
      console.error("Failed to create draft:", e);
    }
  }, [ports, label, shortName, deviceType, color, node, hostname, poeBudgetW, poeDrawW, unitCost, manufacturer, modelNumber, referenceUrl, category, powerDrawW, powerCapacityW, voltage, thermalBtuh, heightMm, widthMm, depthMm, weightKg, isVenueProvided, auxiliaryData, searchTermsRaw]);

  const handleSaveAsPreset = useCallback(() => {
    if (!editingNodeId || !node?.data.templateId) return;
    const templateId = node.data.templateId;

    // Normalize ports to stable preset IDs
    const presetPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({ ...p, id: `preset-${i}`, label: p.label.trim() }));

    // Remap hiddenPorts through old→new mapping
    const idMap = new Map<string, string>();
    ports.filter((p) => p.label.trim()).forEach((p, i) => { idMap.set(p.id, `preset-${i}`); });
    const presetHidden = hiddenPorts
      .map((id) => idMap.get(id) ?? id)
      .filter((id) => presetPorts.some((p) => p.id === id));

    setTemplatePreset(templateId, {
      ports: presetPorts,
      ...(presetHidden.length > 0 ? { hiddenPorts: presetHidden } : {}),
      ...(color ? { color } : {}),
    });

    // Also apply changes to current device
    handleSave();
  }, [editingNodeId, node, ports, hiddenPorts, color, setTemplatePreset, handleSave]);

  const handleRevertToTemplate = useCallback(() => {
    if (!node) return;
    const templateId = node.data.templateId;
    const tpl = templateId
      ? getBundledTemplates().find((t) => t.id === templateId) ??
        customTemplates.find((t) => t.id === templateId)
      : undefined;
    if (!tpl) return;

    setPorts(tpl.ports.map((p) => ({
      id: p.id,
      label: p.label,
      signalType: p.signalType,
      direction: p.direction,
      section: p.section,
      connectorType: p.connectorType,
      gender: p.gender,
      networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
      capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      multiConnect: p.multiConnect,
      directAttach: p.directAttach,
      notes: p.notes,
      poeDrawW: p.poeDrawW,
      linkSpeed: p.linkSpeed,
      flipped: p.flipped,
      addressable: p.addressable,
    })));
    setHiddenPorts([]);
    setColor(tpl.color);

    // For user templates, also revert all editable metadata fields
    if (customTemplates.some((t) => t.id === templateId)) {
      setLabel(tpl.label ?? "");
      setShortName(tpl.shortName ?? "");
      setManufacturer(tpl.manufacturer ?? "");
      setModelNumber(tpl.modelNumber ?? "");
      setReferenceUrl(tpl.referenceUrl ?? "");
      setCategory(tpl.category ?? "");
      setHostname(tpl.hostname ?? "");
      setPowerDrawW(tpl.powerDrawW);
      setPowerCapacityW(tpl.powerCapacityW);
      setVoltage(tpl.voltage);
      setThermalBtuh(tpl.thermalBtuh);
      setPoeBudgetW(tpl.poeBudgetW);
      setPoeDrawW(tpl.poeDrawW);
      setUnitCost(tpl.unitCost);
      setHeightMm(tpl.heightMm);
      setWidthMm(tpl.widthMm);
      setDepthMm(tpl.depthMm);
      setWeightKg(tpl.weightKg);
      setIsVenueProvided(tpl.isVenueProvided ?? false);
      setAuxiliaryData(normalizeAuxRows(tpl.auxiliaryData));
      setSearchTermsRaw((tpl.searchTerms ?? []).join(", "));
    }
  }, [node, customTemplates]);

  const handleRevertToPreset = useCallback(() => {
    if (!node?.data.templateId) return;
    const preset = templatePresets[node.data.templateId];
    if (!preset) return;

    setPorts(preset.ports.map((p) => ({
      id: p.id,
      label: p.label,
      signalType: p.signalType,
      direction: p.direction,
      section: p.section,
      connectorType: p.connectorType,
      gender: p.gender,
      networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
      capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      directAttach: p.directAttach,
      notes: p.notes,
      poeDrawW: p.poeDrawW,
      linkSpeed: p.linkSpeed,
      flipped: p.flipped,
      addressable: p.addressable,
    })));
    setHiddenPorts(preset.hiddenPorts ?? []);
    setColor(preset.color);
  }, [node, templatePresets]);

  const addPort = (direction: PortDirection) => {
    const draft = newPortDraft(direction);
    setPorts((prev) => [...prev, draft]);
    setSelectedPortId(draft.id);
  };

  const removePort = (id: string) => {
    setPorts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      // Keep a valid selection: jump to the first remaining port (or clear).
      setSelectedPortId((sel) => (sel === id ? (next[0]?.id ?? null) : sel));
      return next;
    });
  };

  const updatePort = (id: string, updates: Partial<PortDraft>) => {
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const bulkAddPorts = (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => {
    const newPorts: PortDraft[] = [];
    const connectorType = DEFAULT_CONNECTOR[signalType];
    const multiConnect = shouldDefaultMultiConnect(signalType, connectorType) || undefined;
    for (let i = 0; i < count; i++) {
      newPorts.push({
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
        label: `${prefix} ${start + i}`,
        signalType,
        direction,
        section: section || undefined,
        multiConnect,
      });
    }
    setPorts((prev) => [...prev, ...newPorts]);
    if (newPorts.length > 0) setSelectedPortId(newPorts[0].id);
  };

  // Drag-and-drop: move a port to a new position/section
  const movePortTo = useCallback(
    (portId: string, targetDirection: PortDirection, targetIndex: number) => {
      setPorts((prev) => {
        const port = prev.find((p) => p.id === portId);
        if (!port) return prev;

        const without = prev.filter((p) => p.id !== portId);
        const updated = { ...port, direction: targetDirection };

        const sectionPorts = without.filter((p) => p.direction === targetDirection);
        const insertAfterId = targetIndex > 0 ? sectionPorts[targetIndex - 1]?.id : null;

        if (sectionPorts.length === 0 || targetIndex === 0) {
          const firstOfSection = without.findIndex((p) => p.direction === targetDirection);
          if (firstOfSection === -1) {
            return [...without, updated];
          }
          without.splice(firstOfSection, 0, updated);
          return [...without];
        }

        const insertAfterIdx = without.findIndex((p) => p.id === insertAfterId);
        without.splice(insertAfterIdx + 1, 0, updated);
        return [...without];
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (draggedPortId && dropTarget) {
      movePortTo(draggedPortId, dropTarget.direction, dropTarget.index);
    }
    setDraggedPortId(null);
    setDropTarget(null);
  }, [draggedPortId, dropTarget, movePortTo]);

  // Dirty detection: compare current editor state against the effective default
  // (preset if one exists, otherwise raw template)
  // Must be above the early return to satisfy rules of hooks.
  const templateId = node?.data.templateId;
  const { dirtyVsPreset, dirtyVsTemplate } = useMemo(() => {
    if (!templateId) return { dirtyVsPreset: false, dirtyVsTemplate: false };

    const tpl = getBundledTemplates().find((t) => t.id === templateId) ??
      customTemplates.find((t) => t.id === templateId);
    const preset = templatePresets[templateId];

    const portsMatch = (a: PortDraft[], b: Port[]) => {
      if (a.length !== b.length) return false;
      return a.every((ap, i) => {
        const bp = b[i];
        return ap.label === bp.label &&
          ap.signalType === bp.signalType &&
          ap.direction === bp.direction &&
          (ap.connectorType ?? undefined) === (bp.connectorType ?? undefined) &&
          (ap.section ?? undefined) === (bp.section ?? undefined);
      });
    };

    const isUserTemplate = customTemplates.some((t) => t.id === templateId);

    const dirtyVsTemplate = !!tpl && (
      !portsMatch(ports, tpl.ports) ||
      hiddenPorts.length > 0 ||
      (color ?? undefined) !== (tpl.color ?? undefined) ||
      // For user templates, also check all editable metadata fields
      (isUserTemplate && (
        label !== (tpl.label ?? "") ||
        (manufacturer ?? "") !== (tpl.manufacturer ?? "") ||
        (modelNumber ?? "") !== (tpl.modelNumber ?? "") ||
        (referenceUrl ?? "") !== (tpl.referenceUrl ?? "") ||
        (category ?? "") !== (tpl.category ?? "") ||
        (hostname ?? "") !== (tpl.hostname ?? "") ||
        powerDrawW !== tpl.powerDrawW ||
        powerCapacityW !== tpl.powerCapacityW ||
        (voltage ?? undefined) !== (tpl.voltage ?? undefined) ||
        thermalBtuh !== tpl.thermalBtuh ||
        poeBudgetW !== tpl.poeBudgetW ||
        poeDrawW !== tpl.poeDrawW ||
        unitCost !== tpl.unitCost ||
        heightMm !== tpl.heightMm ||
        widthMm !== tpl.widthMm ||
        depthMm !== tpl.depthMm ||
        weightKg !== tpl.weightKg ||
        isVenueProvided !== (tpl.isVenueProvided ?? false)
      ))
    );

    const dirtyVsPreset = !!preset && (
      !portsMatch(ports, preset.ports) ||
      JSON.stringify([...hiddenPorts].sort()) !== JSON.stringify([...(preset.hiddenPorts ?? [])].sort()) ||
      (color ?? undefined) !== (preset.color ?? undefined)
    );

    return { dirtyVsPreset, dirtyVsTemplate };
  }, [templateId, ports, hiddenPorts, color, templatePresets, customTemplates, label, manufacturer, modelNumber, referenceUrl, category, hostname, powerDrawW, powerCapacityW, voltage, thermalBtuh, poeBudgetW, poeDrawW, unitCost, heightMm, widthMm, depthMm, weightKg, isVenueProvided]);

  if (!editingNodeId || !node) return null;

  const drift = getTemplateDrift(node.data, customTemplates);
  const hasPreset = !!(templateId && templatePresets[templateId]);
  const inputs = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const bidir = ports.filter((p) => p.direction === "bidirectional");
  const passthroughPorts = ports.filter((p) => p.direction === "passthrough");

  const namedPortCount = ports.filter((p) => p.label.trim()).length;
  const inCount = ports.filter((p) => p.direction === "input").length;
  const outCount = ports.filter((p) => p.direction === "output").length;
  const selectedPort = ports.find((p) => p.id === selectedPortId);

  // Live preview rows: outputs are right-justified, everything else left.
  const previewName = label.trim() || "Untitled";
  const previewCategory = (category.trim() || deviceType.trim() || "device").toUpperCase();

  const specUrl = (() => {
    const tpl = node.data.templateId
      ? getBundledTemplates().find((t) => t.id === node.data.templateId)
      : undefined;
    return referenceUrl.trim() || tpl?.referenceUrl;
  })();

  const canSubmitToCommunity =
    (!templateId || dirtyVsTemplate || customTemplates.some((t) => t.id === templateId)) &&
    ports.some((p) => p.label.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]"
      onKeyDownCapture={onCtrlEnter}
    >
      {/* ── Header (50px) ── */}
      <header className="h-[50px] flex-none flex items-center gap-3 px-4 bg-[var(--color-surface)] border-b border-[var(--ui-border)]">
        <button
          onClick={close}
          className="flex items-center gap-1.5 h-[30px] pl-2 pr-2.5 bg-transparent border border-[var(--ui-border)] rounded-lg cursor-pointer text-[var(--color-text)] text-[11.5px] font-medium hover:bg-[var(--color-surface-hover)] transition-colors"
          title="Back to library — discard or keep your changes via Cancel/Done"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Library
        </button>
        <div className="flex flex-col leading-[1.25]">
          <span className="text-[13px] font-semibold text-[var(--color-text-heading)]">Device Editor</span>
          <span
            className="text-[9px] text-[var(--color-text-muted)] tracking-[0.04em]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {namedPortCount} PORTS · {inCount} IN · {outCount} OUT
          </span>
        </div>

        {/* Template-drift notice — kept inline so the update path stays reachable. */}
        {drift && (
          <button
            onClick={() => setShowSyncDialog(true)}
            className="ml-3 flex items-center gap-1.5 h-[26px] px-2.5 rounded-md text-[10.5px] font-medium cursor-pointer text-[var(--color-accent)] border border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors"
            title={`Template updated — v${drift.deviceVersion} → v${drift.currentVersion} available`}
          >
            Update available · v{drift.deviceVersion} → v{drift.currentVersion}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1aa179]" />
            {templateId && customTemplates.some((t) => t.id === templateId) ? "User template" : "Editing device"}
          </span>
          <button onClick={close} className="ui-btn ui-btn-secondary h-[30px] text-[11.5px]">Cancel</button>
          <button onClick={handleSave} className="ui-btn ui-btn-primary h-[30px] text-[11.5px]">Done</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">

        {/* LEFT: live preview + identity + advanced sections */}
        <aside className="w-[330px] flex-none border-r border-[var(--ui-border)] bg-[var(--color-surface)] flex flex-col overflow-auto">
          {/* live node preview */}
          <div
            className="p-5 border-b border-[var(--ui-border)] flex justify-center bg-[var(--color-bg)]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-text-muted) 22%, transparent) 1px, transparent 0)",
              backgroundSize: "14px 14px",
            }}
          >
            <div
              className="w-[188px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg relative"
              style={{ boxShadow: "0 10px 26px -14px rgba(0,20,45,.9)" }}
            >
              <span
                className="absolute left-0 top-[9px] bottom-[9px] w-[2.5px] rounded-sm"
                style={{ background: headerColor ?? "var(--color-accent)" }}
              />
              <div
                className="flex items-center gap-2 pl-[13px] pr-[11px] py-[9px] border-b border-[var(--ui-border)] rounded-t-lg"
                style={{ background: headerColor ?? "var(--color-surface-raised)" }}
              >
                {icon && <span className="text-[12px] leading-none flex-none">{icon}</span>}
                <span className="flex flex-col leading-[1.3] min-w-0">
                  <span className="text-[11.5px] font-semibold text-[var(--color-text-heading)] whitespace-nowrap overflow-hidden text-ellipsis">
                    {previewName}
                  </span>
                  <span className="text-[8px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
                    {previewCategory}
                  </span>
                </span>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#1aa179] flex-none" />
              </div>
              <div className="py-[5px] min-h-[30px]">
                {ports.filter((p) => p.label.trim()).slice(0, 8).map((p) => {
                  const isOut = p.direction === "output";
                  const swatch = SIGNAL_COLORS[p.signalType];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-1.5 h-5 px-[9px]"
                      style={{ justifyContent: isOut ? "flex-end" : "flex-start" }}
                    >
                      {isOut && <span className="text-[9px] text-[var(--color-text)] whitespace-nowrap">{p.label}</span>}
                      <span
                        className="w-[7px] h-[7px] rounded-sm flex-none"
                        style={{ background: swatch }}
                      />
                      {!isOut && <span className="text-[9px] text-[var(--color-text)] whitespace-nowrap">{p.label}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 px-[11px] py-[5px] border-t border-[var(--ui-border)]">
                <span className="text-[8px] text-[var(--color-text)]" style={{ fontFamily: "var(--font-mono)" }}>{namedPortCount} I/O</span>
                <span className="text-[8px] text-[var(--color-text-muted)] ml-auto" style={{ fontFamily: "var(--font-mono)" }}>PREVIEW</span>
              </div>
            </div>
          </div>

          {/* identity fields */}
          <div className="p-4 flex flex-col gap-3">
            <div className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
              Identity
            </div>

            <Field label="Device name">
              <input
                className="ui-input w-full text-xs"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Camera 1"
              />
              {node.data.model && label.trim() !== node.data.model && (
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Template: {node.data.model}
                </div>
              )}
            </Field>

            <Field label="Short name">
              <input
                className="ui-input w-full text-xs"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g. HDC-5500"
              />
            </Field>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(() => {
                const hasCompact = !!(shortName.trim() || modelNumber.trim());
                const fallbackLabel = !shortName.trim() && modelNumber.trim() ? ` — falls back to model number "${modelNumber.trim()}"` : "";
                return (
                  <label
                    className={`flex items-center gap-1.5 text-[11px] ${hasCompact ? "text-[var(--color-text)] cursor-pointer" : "text-[var(--color-text-muted)] opacity-60 cursor-not-allowed"}`}
                    title={hasCompact
                      ? `Use the short name on this device${fallbackLabel}. Leave unchecked to inherit the schematic-wide default.`
                      : "Set a Short Name (or Model Number) above to enable this toggle."}
                  >
                    <input
                      type="checkbox"
                      disabled={!hasCompact}
                      checked={useShortName === true}
                      ref={(el) => { if (el) el.indeterminate = useShortName === undefined; }}
                      onChange={(e) => setUseShortName(e.target.checked ? true : (useShortName === undefined ? false : undefined))}
                    />
                    Use short name {useShortName === undefined && hasCompact && <span className="text-[var(--color-text-muted)]">(inherit)</span>}
                  </label>
                );
              })()}
              <label
                className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer"
                title="Wrap the device label across two lines on this device. Leave unchecked to inherit the schematic-wide default."
              >
                <input
                  type="checkbox"
                  checked={wrapLabel === true}
                  ref={(el) => { if (el) el.indeterminate = wrapLabel === undefined; }}
                  onChange={(e) => setWrapLabelState(e.target.checked ? true : (wrapLabel === undefined ? false : undefined))}
                />
                Wrap label {wrapLabel === undefined && <span className="text-[var(--color-text-muted)]">(inherit)</span>}
              </label>
            </div>

            <Field label="Icon">
              <div className="flex flex-wrap items-center gap-1">
                {["🎥", "📹", "📷", "🎤", "🎙", "🔊", "🎛", "🎚", "🖥", "💻", "📺", "📡", "🌐", "🔀", "💡", "🔌", "⚡", "🗄", "☁️", "⚙️"].map((glyph) => (
                  <button
                    key={glyph}
                    type="button"
                    onClick={() => setIcon(icon === glyph ? "" : glyph)}
                    className={`w-7 h-7 rounded-md text-sm flex items-center justify-center cursor-pointer transition-colors ${
                      icon === glyph
                        ? "bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]"
                        : "hover:bg-[var(--color-surface-hover)]"
                    }`}
                    title={icon === glyph ? "Click to remove icon" : "Use this icon"}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Shown before the device name on the canvas.
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Device type">
                <Combobox
                  value={deviceType}
                  onCommit={setDeviceType}
                  suggestions={suggestions.deviceType}
                  placeholder="e.g. camera"
                />
              </Field>
              <Field label="Category">
                <Combobox
                  value={category}
                  onCommit={setCategory}
                  suggestions={suggestions.category}
                  placeholder="e.g. video"
                />
              </Field>
              <Field label="Manufacturer">
                <Combobox
                  value={manufacturer}
                  onCommit={setManufacturer}
                  suggestions={suggestions.manufacturer}
                  placeholder="e.g. Sony"
                />
              </Field>
              <Field label="Model number">
                <input
                  className="ui-input w-full text-xs"
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  placeholder="e.g. FX9"
                />
              </Field>
              <Field label="Serial number">
                <input
                  className="ui-input w-full text-xs"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. SN-00421"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </Field>
              <Field label="Reference URL">
                <input
                  type="url"
                  className="ui-input w-full text-xs"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>

            {specUrl && (
              <a
                href={specUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--color-accent)] hover:underline transition-colors flex items-center gap-1 -mt-1"
                title="View manufacturer spec page"
                onClick={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                  <path d="M9 2h5v5" />
                  <path d="M14 2L7 9" />
                </svg>
                <span>Spec sheet</span>
              </a>
            )}

            <Field label="Tags">
              <TagInput
                tags={tags}
                onChange={setTags}
                suggestions={suggestions.tags}
                placeholder="e.g. rental, FOH"
              />
            </Field>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-muted)]">Header colour</span>
              <input
                type="color"
                className="w-6 h-6 rounded border border-[var(--color-border)] cursor-pointer p-0"
                value={headerColor ?? "#4b5563"}
                onChange={(e) => setHeaderColor(e.target.value)}
              />
              {headerColor && (
                <button
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                  onClick={() => setHeaderColor(undefined)}
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">Hostname</span>
              <input
                className="ui-input flex-1 text-xs"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="e.g. nvx-room101"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            {/* Preset indicator */}
            {hasPreset && templateId && (
              <div className="text-[10px] text-[var(--color-accent)] bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/40 rounded px-2 py-1 flex items-center justify-between">
                <span>Preset active for all &ldquo;{node.data.model || "this template"}&rdquo; devices</span>
                <button
                  onClick={() => setTemplatePreset(templateId, null)}
                  className="hover:underline cursor-pointer ml-2"
                >
                  Clear
                </button>
              </div>
            )}

            {/* ── Advanced sections (collapsible) ── */}
            <div className="mt-1 flex flex-col gap-1 border-t border-[var(--ui-border)] pt-3">
              <div className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)] mb-1" style={{ fontFamily: "var(--font-mono)" }}>
                Advanced
              </div>

              {/* Port Visibility */}
              <PortVisibilitySection
                showAllPorts={showAllPorts}
                setShowAllPorts={setShowAllPorts}
                hiddenPorts={hiddenPorts}
                setHiddenPorts={setHiddenPorts}
                ports={ports}
                node={node}
                nodes={nodes}
                templateHiddenSignals={templateHiddenSignals}
                setTemplateHiddenSignals={setTemplateHiddenSignals}
                open={portVisOpen}
                setOpen={setPortVisOpen}
              />

              {/* Physical Dimensions */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                  Physical Dimensions
                </summary>
                <div className="pt-1 pl-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Height (mm)</label>
                    <input
                      type="number"
                      className="ui-input w-full text-xs"
                      value={heightMm ?? ""}
                      onChange={(e) => setHeightMm(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 44"
                      min={1}
                      step={1}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Width (mm)</label>
                    <input
                      type="number"
                      className="ui-input w-full text-xs"
                      value={widthMm ?? ""}
                      onChange={(e) => setWidthMm(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 482"
                      min={1}
                      step={1}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Depth (mm)</label>
                    <input
                      type="number"
                      className="ui-input w-full text-xs"
                      value={depthMm ?? ""}
                      onChange={(e) => setDepthMm(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 350"
                      min={1}
                      step={1}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Weight (kg)</label>
                    <input
                      type="number"
                      className="ui-input w-full text-xs"
                      value={weightKg ?? ""}
                      onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 2.5"
                      min={0}
                      step={0.1}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </details>

              {/* Loudspeaker / Coverage */}
              {(isSpeaker({ deviceType, ports }) ||
                speakerSensitivityDb != null ||
                speakerMaxPowerW != null ||
                speakerCoverageAngleDeg != null) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                    Loudspeaker / Coverage
                  </summary>
                  <div className="pt-1 pl-2 grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Sensitivity (dB)</label>
                      <input
                        type="number"
                        className="ui-input w-full text-xs"
                        value={speakerSensitivityDb ?? ""}
                        onChange={(e) => setSpeakerSensitivityDb(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 86"
                        min={1}
                        step={0.1}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Max Power (W)</label>
                      <input
                        type="number"
                        className="ui-input w-full text-xs"
                        value={speakerMaxPowerW ?? ""}
                        onChange={(e) => setSpeakerMaxPowerW(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 100"
                        min={1}
                        step={1}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Coverage (°)</label>
                      <input
                        type="number"
                        className="ui-input w-full text-xs"
                        value={speakerCoverageAngleDeg ?? ""}
                        onChange={(e) => setSpeakerCoverageAngleDeg(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 90"
                        min={1}
                        max={359}
                        step={1}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] pl-2 pt-1 leading-relaxed">
                    Drives the plan-view coverage wedge and SPL estimate (nominal, on-axis — not a measured guarantee).
                  </p>
                </details>
              )}

              {/* DHCP server + PoE — only when an RJ45/EtherCon port exists */}
              {ports.some((p) => p.connectorType === "rj45" || p.connectorType === "ethercon") && (
                <>
                  <DhcpServerSection dhcpServer={dhcpServer} onChange={setDhcpServer} />
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={poeBudgetW != null}
                        onChange={(e) => setPoeBudgetW(e.target.checked ? 0 : undefined)}
                        className="cursor-pointer"
                      />
                      PoE Source
                    </label>
                    {poeBudgetW != null && (
                      <input
                        className="ui-input w-20 text-xs"
                        type="number"
                        value={poeBudgetW || ""}
                        onChange={(e) => setPoeBudgetW(e.target.value ? Number(e.target.value) : 0)}
                        placeholder="Budget (W)"
                        min={0}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={poeDrawW != null}
                        onChange={(e) => setPoeDrawW(e.target.checked ? 0 : undefined)}
                        className="cursor-pointer"
                      />
                      Powered by PoE
                    </label>
                    {poeDrawW != null && (
                      <input
                        className="ui-input w-20 text-xs"
                        type="number"
                        value={poeDrawW || ""}
                        onChange={(e) => setPoeDrawW(e.target.value ? Number(e.target.value) : 0)}
                        placeholder="Draw (W)"
                        min={0}
                        step={0.1}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Expansion Slots */}
              {(() => {
                const templateDef = node.data.templateId
                  ? getBundledTemplates().find((t) => t.id === node.data.templateId)
                  : undefined;
                const slotDefs = templateDef?.slots ?? [];
                return (
                  <SlotEditSection
                    nodeId={node.id}
                    installedSlots={node.data.slots ?? []}
                    slotDefs={slotDefs}
                  />
                );
              })()}

              {/* Power */}
              {(ports.some((p) => p.signalType === "power") || deviceType.includes("power")) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                    Power
                  </summary>
                  <div className="grid grid-cols-2 gap-2 pt-1 pl-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Power Draw (W)</label>
                      <input
                        type="number"
                        className="ui-input w-full text-xs"
                        value={powerDrawW ?? ""}
                        onChange={(e) => setPowerDrawW(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Voltage</label>
                      <input
                        type="text"
                        className="ui-input w-full text-xs"
                        value={voltage ?? ""}
                        onChange={(e) => setVoltage(e.target.value || undefined)}
                        placeholder="100-240V"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label
                        className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5"
                        title="Thermal load for HVAC sizing. Auto-derived from Power Draw × 3.412 if left blank."
                      >
                        Thermal (BTU/h)
                      </label>
                      <input
                        type="number"
                        className="ui-input w-full text-xs"
                        value={thermalBtuh ?? ""}
                        onChange={(e) => setThermalBtuh(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder={(() => {
                          const auto = deriveThermalBtuh(powerDrawW);
                          return auto != null ? `auto: ${auto}` : "0";
                        })()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {deviceType.includes("power-distribution") && (
                      <div className="col-span-2">
                        <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Power Capacity (W)</label>
                        <input
                          type="number"
                          className="ui-input w-full text-xs"
                          value={powerCapacityW ?? ""}
                          onChange={(e) => setPowerCapacityW(e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="0"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Search Terms */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                  {(() => { const n = searchTermsRaw.split(",").map((s) => s.trim()).filter(Boolean).length; return `Search Terms${n > 0 ? ` (${n})` : ""}`; })()}
                </summary>
                <div className="pt-1 pl-2">
                  <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
                    Comma-separated keywords used to find this device in the library. Edit here and "Submit to Community" to contribute improvements back.
                  </p>
                  <input
                    type="text"
                    className="ui-input w-full text-xs"
                    value={searchTermsRaw}
                    onChange={(e) => setSearchTermsRaw(e.target.value)}
                    placeholder="e.g. matrix, router, video switcher"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </details>

              {/* Cost */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                  Cost
                </summary>
                <div className="pt-1 pl-2">
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                    Unit Cost ({currency})
                  </label>
                  <input
                    type="number"
                    className="ui-input w-full text-xs"
                    value={unitCost ?? ""}
                    onChange={(e) => setUnitCost(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </details>

              {/* Auxiliary Data */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                  Auxiliary Data
                </summary>
                <div className="flex flex-col gap-1.5 pt-1 pl-2">
                  <p className="text-[10px] text-[var(--color-text-muted)] -mb-0.5">
                    Up to 5 custom lines. Use the <span className="font-mono">+</span> button to insert a device field. Leave a line blank to add a separator. Toggle <span className="font-mono">H</span>/<span className="font-mono">F</span> to pin a row to the header or footer of the device.
                  </p>
                  {(() => {
                    const previewDevice = {
                      label,
                      hostname,
                      manufacturer,
                      modelNumber: node?.data.modelNumber,
                      deviceType,
                      powerDrawW,
                      powerCapacityW,
                      poeBudgetW,
                      poeDrawW,
                      voltage,
                      thermalBtuh,
                      weightKg,
                      widthMm,
                      heightMm,
                      depthMm,
                      unitCost,
                      ports,
                    } as unknown as DeviceData;
                    return [0, 1, 2, 3, 4].map((i) => {
                      const row = auxiliaryData[i] ?? { text: "", position: "footer" as const };
                      const text = row.text;
                      const position = row.position ?? "footer";
                      const hasToken = text.indexOf("{{") !== -1;
                      const preview = hasToken ? resolveAuxiliaryLine(text, previewDevice) : "";
                      const setRow = (next: Partial<AuxRow>) => {
                        const newData = [...auxiliaryData];
                        while (newData.length <= i) newData.push({ text: "", position: "footer" });
                        newData[i] = { ...newData[i], ...next };
                        setAuxiliaryData(newData);
                      };
                      return (
                        <div key={i} className="relative">
                          <div className="flex gap-1">
                            <input
                              ref={(el) => { auxInputRefs.current[i] = el; }}
                              type="text"
                              className="ui-input flex-1 min-w-0 text-xs"
                              value={text}
                              onChange={(e) => setRow({ text: e.target.value })}
                              placeholder="Auxiliary Data"
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              title="Insert device field"
                              className="ui-btn ui-btn-ghost text-xs shrink-0"
                              onClick={() => setAuxFieldMenuIdx(auxFieldMenuIdx === i ? null : i)}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              title={position === "header" ? "Pinned to header — click to move to footer" : "Pinned to footer — click to move to header"}
                              className={`ui-btn shrink-0 w-7 text-[10px] font-semibold ${position === "header" ? "ui-btn-primary" : "ui-btn-ghost"}`}
                              onClick={() => setRow({ position: position === "header" ? "footer" : "header" })}
                            >
                              {position === "header" ? "H" : "F"}
                            </button>
                          </div>
                          {hasToken && (
                            <div className="text-[10px] text-[var(--color-text-muted)] pl-1 truncate" title={preview}>
                              → {preview || <span className="italic">(empty)</span>}
                            </div>
                          )}
                          {auxFieldMenuIdx === i && (
                            <div
                              ref={auxMenuRef}
                              className="absolute right-0 z-20 mt-1 w-56 max-h-64 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg"
                            >
                              {AUX_FIELD_GROUPS.map(({ group, fields }) => (
                                <div key={group} className="py-1">
                                  <div className="px-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                    {group}
                                  </div>
                                  {fields.map((f) => (
                                    <button
                                      key={f.token}
                                      type="button"
                                      className="block w-full text-left px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-bg)] cursor-pointer"
                                      onClick={() => {
                                        const input = auxInputRefs.current[i];
                                        const token = `{{${f.token}}}`;
                                        const start = input?.selectionStart ?? text.length;
                                        const end = input?.selectionEnd ?? text.length;
                                        const nextText = text.slice(0, start) + token + text.slice(end);
                                        setRow({ text: nextText });
                                        setAuxFieldMenuIdx(null);
                                        // Restore focus + caret after the inserted token
                                        requestAnimationFrame(() => {
                                          const el = auxInputRefs.current[i];
                                          if (el) {
                                            el.focus();
                                            const pos = start + token.length;
                                            el.setSelectionRange(pos, pos);
                                          }
                                        });
                                      }}
                                    >
                                      {f.label}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </details>

              {/* Flags */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                  Flags
                </summary>
                <div className="flex flex-col gap-2 pt-1 pl-2">
                  <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isCableAccessory}
                      onChange={(e) => {
                        setIsCableAccessory(e.target.checked);
                        if (!e.target.checked) setIntegratedWithCable(false);
                      }}
                      className="cursor-pointer"
                    />
                    Cable accessory
                  </label>
                  {isCableAccessory && (
                    <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none ml-4">
                      <input
                        type="checkbox"
                        checked={integratedWithCable}
                        onChange={(e) => setIntegratedWithCable(e.target.checked)}
                        className="cursor-pointer"
                      />
                      Integrated with cable
                    </label>
                  )}
                  {deviceType === "adapter" && (
                    <label className="flex items-center gap-1.5 text-[var(--color-text)] select-none">
                      <span className="text-[var(--color-text-muted)]">Visibility:</span>
                      <select
                        value={adapterVisibility}
                        onChange={(e) => setAdapterVisibility(e.target.value as "default" | "force-show" | "force-hide")}
                        className="ui-input text-xs cursor-pointer"
                      >
                        <option value="default">Default</option>
                        <option value="force-show">Always Show</option>
                        <option value="force-hide">Always Hide</option>
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isVenueProvided}
                      onChange={(e) => setIsVenueProvided(e.target.checked)}
                      className="cursor-pointer"
                    />
                    Venue provided (exclude from pack list)
                  </label>
                </div>
              </details>

              {/* Face-plate editor entry — preserved from the legacy editor. */}
              <button
                type="button"
                onClick={() => setShowFacePlateEditor(true)}
                className="text-left text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] cursor-pointer py-1"
              >
                Edit face-plate layout…
              </button>
            </div>
          </div>
        </aside>

        {/* MIDDLE: port list */}
        <div className="w-[300px] flex-none border-r border-[var(--ui-border)] bg-[var(--color-surface)] flex flex-col min-h-0">
          <div className="h-11 flex-none flex items-center gap-2 px-3.5 border-b border-[var(--ui-border)]">
            <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Ports</span>
            <span className="text-[9.5px] text-[var(--color-accent)]" style={{ fontFamily: "var(--font-mono)" }}>{namedPortCount}</span>
            <AddPortMenu deviceType={deviceType} onAdd={addPort} />
          </div>
          <div className="flex-1 overflow-auto p-2 flex flex-col gap-3">
            <PortListGroup
              title={deviceType === "patch-panel" ? "Rear" : "Inputs"}
              direction="input"
              ports={inputs}
              selectedPortId={selectedPortId}
              onSelect={setSelectedPortId}
              onAdd={() => addPort("input")}
              onBulkAdd={bulkAddPorts}
              hiddenPorts={hiddenPorts}
              setHiddenPorts={setHiddenPorts}
              draggedPortId={draggedPortId}
              setDraggedPortId={setDraggedPortId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDragEnd={handleDragEnd}
            />
            <PortListGroup
              title={deviceType === "patch-panel" ? "Front" : "Outputs"}
              direction="output"
              ports={outputs}
              selectedPortId={selectedPortId}
              onSelect={setSelectedPortId}
              onAdd={() => addPort("output")}
              onBulkAdd={bulkAddPorts}
              hiddenPorts={hiddenPorts}
              setHiddenPorts={setHiddenPorts}
              draggedPortId={draggedPortId}
              setDraggedPortId={setDraggedPortId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDragEnd={handleDragEnd}
            />
            {(deviceType !== "patch-panel" || bidir.length > 0) && (
              <PortListGroup
                title="Bidirectional"
                direction="bidirectional"
                ports={bidir}
                selectedPortId={selectedPortId}
                onSelect={setSelectedPortId}
                onAdd={() => addPort("bidirectional")}
                onBulkAdd={bulkAddPorts}
                hiddenPorts={hiddenPorts}
                setHiddenPorts={setHiddenPorts}
                draggedPortId={draggedPortId}
                setDraggedPortId={setDraggedPortId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onDragEnd={handleDragEnd}
              />
            )}
            {(deviceType === "patch-panel" || deviceType === "wall-plate" || passthroughPorts.length > 0) && (
              <PortListGroup
                title="Passthrough Circuits"
                direction="passthrough"
                ports={passthroughPorts}
                selectedPortId={selectedPortId}
                onSelect={setSelectedPortId}
                onAdd={() => addPort("passthrough")}
                onBulkAdd={bulkAddPorts}
                hiddenPorts={hiddenPorts}
                setHiddenPorts={setHiddenPorts}
                draggedPortId={draggedPortId}
                setDraggedPortId={setDraggedPortId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onDragEnd={handleDragEnd}
              />
            )}
          </div>
        </div>

        {/* RIGHT: selected-port config */}
        <div className="flex-1 min-w-0 bg-[var(--color-bg)] flex flex-col">
          {selectedPort ? (
            <PortConfigPanel
              key={selectedPort.id}
              port={selectedPort}
              deviceType={deviceType}
              hiddenPorts={hiddenPorts}
              setHiddenPorts={setHiddenPorts}
              onUpdate={(u) => updatePort(selectedPort.id, u)}
              onRemove={() => removePort(selectedPort.id)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth={1.4} />
                <circle cx="8" cy="12" r="1.4" fill="currentColor" />
              </svg>
              <span className="text-[12.5px]">Select a port to configure it</span>
              <button onClick={() => addPort("input")} className="ui-btn ui-btn-secondary mt-1 text-xs">Add the first port</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: template / community actions ── */}
      <footer className="flex-none flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface)] border-t border-[var(--ui-border)]">
        <button onClick={handleSaveAsTemplate} className="ui-btn ui-btn-ghost text-xs" title="Save this device configuration as a reusable user template">
          Save as User Template
        </button>
        {canSubmitToCommunity && (
          <button onClick={handleSubmitToCommunity} className="ui-btn ui-btn-ghost text-xs" title="Submit this device to the community device library">
            Submit to Community
          </button>
        )}
        {templateId && customTemplates.some((t) => t.id === templateId) ? (
          <button onClick={handleUpdateUserTemplate} className="ui-btn ui-btn-ghost text-xs" title="Overwrite the saved user template with this configuration">
            Update User Template
          </button>
        ) : templateId ? (
          <button onClick={handleSaveAsPreset} className="ui-btn ui-btn-ghost text-xs" title="Set this configuration as the project default for this template">
            Save as Preset
          </button>
        ) : null}
        {hasPreset && dirtyVsPreset && (
          <button onClick={handleRevertToPreset} className="ui-btn ui-btn-ghost text-xs" title="Reset ports and visibility to the project preset">
            Revert to Preset
          </button>
        )}
        {dirtyVsTemplate && (
          <button onClick={handleRevertToTemplate} className="ui-btn ui-btn-ghost text-xs" title="Reset ports and visibility to the original template defaults">
            Revert to Template
          </button>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘+Enter to apply</span>
      </footer>

      <LoginDialog open={showLoginDialog} onClose={() => setShowLoginDialog(false)} />
      {showFacePlateEditor && node && (
        <FacePlateEditor
          deviceData={node.data as DeviceData}
          onSave={(layout: FacePlateLayout) => {
            patchDeviceData(editingNodeId!, { facePlateLayout: layout });
            setShowFacePlateEditor(false);
          }}
          onClose={() => setShowFacePlateEditor(false)}
        />
      )}
      {showSyncDialog && drift && editingNodeId && (
        <TemplateSyncDialog
          deviceId={editingNodeId}
          device={node.data}
          template={drift.template}
          edges={edges}
          onConfirm={() => {
            syncDeviceFromTemplate(editingNodeId);
            setShowSyncDialog(false);
          }}
          onCancel={() => setShowSyncDialog(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/** "Add port" split button — adds an input by default, with a small menu for the other directions
 *  so every port direction (input / output / bidirectional / passthrough) remains reachable. */
function AddPortMenu({
  deviceType,
  onAdd,
}: {
  deviceType: string;
  onAdd: (direction: PortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isPatch = deviceType === "patch-panel";
  const options: Array<{ dir: PortDirection; label: string }> = [
    { dir: "input", label: isPatch ? "Rear port" : "Input" },
    { dir: "output", label: isPatch ? "Front port" : "Output" },
    { dir: "bidirectional", label: "Bidirectional" },
    { dir: "passthrough", label: "Passthrough" },
  ];

  return (
    <div ref={ref} className="ml-auto relative flex items-center">
      <button
        onClick={() => onAdd("input")}
        className="flex items-center gap-1.5 h-[27px] pl-2.5 pr-2 rounded-l-md cursor-pointer text-[11px] font-medium text-[var(--color-accent)] border border-[var(--color-accent)]/40 border-r-0"
        style={{ background: "var(--color-accent-soft)" }}
        title="Add an input port"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
        Add port
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-[27px] px-1 rounded-r-md cursor-pointer text-[var(--color-accent)] border border-[var(--color-accent)]/40"
        style={{ background: "var(--color-accent-soft)" }}
        title="Choose port direction"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-[30px] z-30 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1">
          {options.map((o) => (
            <button
              key={o.dir}
              onClick={() => { onAdd(o.dir); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A direction group in the MIDDLE port list: header (title + count + add/bulk), draggable rows,
 *  and a drop zone. Selecting a row opens it in the RIGHT config panel. */
function PortListGroup({
  title,
  direction,
  ports,
  selectedPortId,
  onSelect,
  onAdd,
  onBulkAdd,
  hiddenPorts,
  setHiddenPorts,
  draggedPortId,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
}: {
  title: string;
  direction: PortDirection;
  ports: PortDraft[];
  selectedPortId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  hiddenPorts: string[];
  setHiddenPorts: React.Dispatch<React.SetStateAction<string[]>>;
  draggedPortId: string | null;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const handleSectionDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (ports.length === 0) setDropTarget({ direction, index: 0 });
  };
  const handleSectionDrop = (e: DragEvent) => {
    e.preventDefault();
    onDragEnd();
  };
  const handleSectionDragLeave = (e: DragEvent) => {
    if (sectionRef.current && !sectionRef.current.contains(e.relatedTarget as Node)) {
      if (dropTarget?.direction === direction) setDropTarget(null);
    }
  };

  const showDropIndicator = dropTarget?.direction === direction;

  return (
    <div ref={sectionRef} onDragOver={handleSectionDragOver} onDrop={handleSectionDrop} onDragLeave={handleSectionDragLeave}>
      <div className="flex items-center gap-2 px-1 mb-1">
        <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{title}</span>
        <span className="text-[9px] text-[var(--color-text-muted)]">{ports.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowBulkAdd((v) => !v)} className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer">Bulk</button>
          <button onClick={onAdd} className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer">+ Add</button>
        </div>
      </div>

      {showBulkAdd && (
        <BulkAddForm
          direction={direction}
          onBulkAdd={onBulkAdd}
          onClose={() => setShowBulkAdd(false)}
        />
      )}

      {ports.length === 0 && !showDropIndicator && (
        <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-1.5">
          No {title.toLowerCase()} — &quot;+ Add&quot; or drag a port here
        </div>
      )}
      {ports.length === 0 && showDropIndicator && (
        <div className="h-1 bg-[var(--color-accent)] rounded-full my-1" />
      )}

      <div className="flex flex-col gap-[3px]">
        {ports.map((port, i) => (
          <PortListRow
            key={port.id}
            port={port}
            index={i}
            direction={direction}
            selected={port.id === selectedPortId}
            hidden={hiddenPorts.includes(port.id)}
            isLast={i === ports.length - 1}
            onSelect={() => onSelect(port.id)}
            onToggleVisibility={() =>
              setHiddenPorts((prev) => (prev.includes(port.id) ? prev.filter((id) => id !== port.id) : [...prev, port.id]))
            }
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

/** A single selectable port row in the MIDDLE list (comp's port-list row). Draggable for reordering. */
function PortListRow({
  port,
  index,
  direction,
  selected,
  hidden,
  isLast,
  onSelect,
  onToggleVisibility,
  draggedPortId,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
}: {
  port: PortDraft;
  index: number;
  direction: PortDirection;
  selected: boolean;
  hidden: boolean;
  isLast: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  draggedPortId: string | null;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(MIME, port.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPortId(port.id);
  };
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midY = rect.top + rect.height / 2;
    setDropTarget({ direction, index: e.clientY < midY ? index : index + 1 });
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragEnd();
  };

  const showBefore = dropTarget?.direction === direction && dropTarget.index === index;
  const showAfter = isLast && dropTarget?.direction === direction && dropTarget.index === index + 1;

  const signalLabel = SIGNAL_LABELS[port.signalType];
  const connectorLabel = port.connectorType ? CONNECTOR_LABELS[port.connectorType] : "";
  const meta = [signalLabel, connectorLabel].filter(Boolean).join(" · ");
  const isDragging = draggedPortId === port.id;

  return (
    <>
      {showBefore && <div className="h-0.5 bg-[var(--color-accent)] rounded-full my-0.5" />}
      <div
        ref={rowRef}
        onClick={onSelect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer border transition-colors ${
          selected
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
            : "border-[var(--ui-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)]"
        } ${isDragging ? "opacity-30" : ""} ${hidden ? "opacity-50" : ""}`}
      >
        <span
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => { setDraggedPortId(null); setDropTarget(null); }}
          onClick={(e) => e.stopPropagation()}
          className="text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing text-[10px] select-none shrink-0"
          title="Drag to reorder / move between sections"
        >
          ⠿
        </span>
        <span
          className="w-[9px] h-[9px] rounded-sm flex-none"
          style={{ background: SIGNAL_COLORS[port.signalType] }}
        />
        <div className="flex flex-col leading-[1.3] min-w-0">
          <span className="text-xs font-medium text-[var(--color-text-heading)] whitespace-nowrap overflow-hidden text-ellipsis">
            {port.label.trim() || <span className="italic text-[var(--color-text-muted)]">Unnamed</span>}
          </span>
          <span className="text-[8.5px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>{meta}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          className="ml-auto shrink-0 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title={hidden ? "Hidden on schematic — click to show" : "Visible on schematic — click to hide"}
        >
          {hidden ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l12 12" />
              <path d="M6.5 6.5a2 2 0 0 0 2.8 2.8" />
              <path d="M4.2 4.2C3 5.1 2 6.4 2 8c1.3 3 3.5 5 6 5 1.2 0 2.3-.4 3.3-1.2M13.4 11.4C14.6 10.4 15.3 9.2 16 8c-1.3-3-3.5-5-6-5-.7 0-1.4.1-2 .4" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8c1.3-3 3.5-5 6-5s4.7 2 6 5c-1.3 3-3.5 5-6 5S3.3 11 2 8z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          )}
        </button>
        <span
          className="shrink-0 text-[8.5px] px-1.5 py-0.5 border border-[var(--ui-border)] rounded text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {DIRECTION_SHORT[port.direction]}
        </span>
      </div>
      {showAfter && <div className="h-0.5 bg-[var(--color-accent)] rounded-full my-0.5" />}
    </>
  );
}

/** RIGHT panel: full configuration for the selected port. Distributes every per-port attribute the
 *  legacy PortRow exposed (label, direction, signal, connector, gender, section, notes, flip,
 *  multi-connect, multicable, direct-attach, network config, capabilities, passthrough rear/front). */
function PortConfigPanel({
  port,
  deviceType,
  hiddenPorts,
  setHiddenPorts,
  onUpdate,
  onRemove,
}: {
  port: PortDraft;
  deviceType: string;
  hiddenPorts: string[];
  setHiddenPorts: React.Dispatch<React.SetStateAction<string[]>>;
  onUpdate: (updates: Partial<PortDraft>) => void;
  onRemove: () => void;
}) {
  const isPassthrough = port.direction === "passthrough";
  const swatch = SIGNAL_COLORS[port.signalType];
  const signalName = SIGNAL_LABELS[port.signalType];
  const connectorType = port.connectorType ?? DEFAULT_CONNECTOR[port.signalType];
  const connName = port.connectorType ? CONNECTOR_LABELS[port.connectorType] : CONNECTOR_LABELS[connectorType];
  const dirLabel = DIRECTION_OPTIONS.find((o) => o.value === port.direction)?.label ?? port.direction;
  const isHidden = hiddenPorts.includes(port.id);

  // Signal tiles: current signal first (deduped), then the common AV signals.
  const signalTiles: SignalType[] = [
    port.signalType,
    ...COMMON_SIGNAL_CHOICES.filter((s) => s !== port.signalType),
  ];

  const showGender = !isPassthrough && CONNECTORS_WITH_GENDER_VARIATION.has(connectorType);
  const resolvedGender = showGender
    ? resolvePortGender({
        id: port.id,
        label: port.label,
        signalType: port.signalType,
        direction: port.direction,
        connectorType,
        gender: port.gender,
      })
    : undefined;

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="max-w-[560px]">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-5">
          <span className="w-[34px] h-[34px] rounded-lg bg-[var(--color-surface)] border border-[var(--ui-border)] flex items-center justify-center flex-none">
            <span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: swatch }} />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[16px] font-semibold text-[var(--color-text-heading)] tracking-[-0.01em] truncate">
              {port.label.trim() || "New port"}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>
              {signalName} · {dirLabel}
            </span>
          </div>
          <button
            onClick={() => setHiddenPorts((prev) => (isHidden ? prev.filter((id) => id !== port.id) : [...prev, port.id]))}
            className="ml-auto flex items-center gap-1.5 h-[30px] px-2.5 bg-transparent border border-[var(--ui-border)] rounded-lg cursor-pointer text-[var(--color-text-muted)] text-[11px] font-medium hover:text-[var(--color-text)] transition-colors"
            title={isHidden ? "Port hidden on the schematic" : "Port shown on the schematic"}
          >
            {isHidden ? "Hidden" : "Visible"}
          </button>
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 h-[30px] px-2.5 bg-transparent border border-[#3a2030] rounded-lg cursor-pointer text-[#e5645f] text-[11px] font-medium hover:bg-[#e5645f]/10 transition-colors"
            title="Remove this port"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Port label */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Port label</span>
            <input
              className="ui-input w-full"
              style={{ height: 34, fontSize: 13 }}
              value={port.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Port label"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>

          {/* Direction (segmented — all four directions) */}
          <div className="flex flex-col gap-2">
            <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Direction</span>
            <Segmented
              options={DIRECTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={port.direction}
              onChange={(v) => {
                const next = v as PortDirection;
                if (next === "passthrough") {
                  onUpdate({ direction: next, signalType: "custom", inheritsSignal: true });
                } else {
                  onUpdate({
                    direction: next,
                    ...(port.inheritsSignal ? { inheritsSignal: undefined, connectorType: DEFAULT_CONNECTOR[port.signalType] } : {}),
                  });
                }
              }}
            />
          </div>

          {/* Signal type grid (hidden for passthrough's "inherits" mode) */}
          {isPassthrough ? (
            <div className="flex flex-col gap-2">
              <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Signal type</span>
              <select
                className="ui-input cursor-pointer"
                value={port.inheritsSignal ? "" : port.signalType}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") onUpdate({ signalType: "custom", inheritsSignal: true });
                  else onUpdate({ signalType: v as SignalType, inheritsSignal: undefined });
                }}
              >
                <option value="">(inherits from connection)</option>
                {ALL_SIGNAL_TYPES.map((t) => (
                  <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Signal type</span>
                {/* Full list fallback so any of the 60+ signals stays selectable. */}
                <select
                  className="ml-auto bg-[var(--color-surface)] border border-[var(--ui-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text)] outline-none cursor-pointer"
                  value={port.signalType}
                  onChange={(e) => {
                    const s = e.target.value as SignalType;
                    onUpdate({ signalType: s, connectorType: DEFAULT_CONNECTOR[s] });
                  }}
                  title="All signal types"
                >
                  {ALL_SIGNAL_TYPES.map((t) => (
                    <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-[7px]">
                {signalTiles.map((sig) => {
                  const active = port.signalType === sig;
                  return (
                    <button
                      key={sig}
                      onClick={() => onUpdate({ signalType: sig, connectorType: DEFAULT_CONNECTOR[sig] })}
                      className={`flex items-center gap-2.5 h-[38px] px-3 rounded-lg cursor-pointer text-xs font-medium text-left border transition-colors ${
                        active
                          ? "border-[var(--color-accent)] text-[var(--color-text-heading)]"
                          : "border-[var(--ui-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                      }`}
                      style={active ? { background: "var(--color-accent-soft)" } : { background: "var(--color-surface)" }}
                    >
                      <span className="w-[11px] h-[11px] rounded-[3px] flex-none" style={{ background: SIGNAL_COLORS[sig] }} />
                      <span className="truncate">{SIGNAL_LABELS[sig]}</span>
                      {active && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="ml-auto flex-none">
                          <path d="M5 12l5 5 9-11" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connector + Gender (not for passthrough — handled by rear/front block below) */}
          {!isPassthrough && (
            <div className="flex gap-3.5 flex-wrap">
              <label className="flex-1 min-w-[200px] flex flex-col gap-1.5">
                <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Connector</span>
                <select
                  className="ui-input cursor-pointer"
                  value={connectorType}
                  onChange={(e) => onUpdate({ connectorType: e.target.value as ConnectorType })}
                >
                  {CONNECTOR_GROUP_ENTRIES.map(([groupName, types]) => (
                    <optgroup key={groupName} label={groupName}>
                      {types.map((c) => (
                        <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {showGender && (
                <label className="flex-1 min-w-[160px] flex flex-col gap-1.5">
                  <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Gender</span>
                  <Segmented
                    options={[
                      { value: "", label: resolvedGender ? `${resolvedGender === "male" ? "M" : "F"} (auto)` : "Auto" },
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                    ]}
                    value={port.gender ?? ""}
                    onChange={(v) => onUpdate({ gender: v === "" ? undefined : (v as Gender) })}
                  />
                </label>
              )}
            </div>
          )}

          {/* Passthrough rear/front connectors */}
          {isPassthrough && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="block text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)] mb-1.5" style={{ fontFamily: "var(--font-mono)" }}>Rear connector</span>
                <div className="flex items-center gap-1.5">
                  <select
                    className="ui-input flex-1 text-xs cursor-pointer"
                    value={port.rearConnectorType ?? ""}
                    onChange={(e) => onUpdate({ rearConnectorType: e.target.value ? (e.target.value as ConnectorType) : undefined })}
                  >
                    <option value="">(unset)</option>
                    {CONNECTOR_GROUP_ENTRIES.map(([groupName, types]) => (
                      <optgroup key={groupName} label={groupName}>
                        {types.map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {port.rearConnectorType && CONNECTORS_WITH_GENDER_VARIATION.has(port.rearConnectorType) && (
                    <select
                      className="ui-input text-xs cursor-pointer shrink-0"
                      value={port.rearGender ?? ""}
                      onChange={(e) => onUpdate({ rearGender: e.target.value === "" ? undefined : (e.target.value as Gender) })}
                      title="Rear gender"
                    >
                      <option value="">—</option>
                      <option value="male">M</option>
                      <option value="female">F</option>
                    </select>
                  )}
                </div>
              </div>
              <div>
                <span className="block text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)] mb-1.5" style={{ fontFamily: "var(--font-mono)" }}>Front connector</span>
                <div className="flex items-center gap-1.5">
                  <select
                    className="ui-input flex-1 text-xs cursor-pointer"
                    value={port.frontConnectorType ?? ""}
                    onChange={(e) => onUpdate({ frontConnectorType: e.target.value ? (e.target.value as ConnectorType) : undefined })}
                  >
                    <option value="">(unset)</option>
                    {CONNECTOR_GROUP_ENTRIES.map(([groupName, types]) => (
                      <optgroup key={groupName} label={groupName}>
                        {types.map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {port.frontConnectorType && CONNECTORS_WITH_GENDER_VARIATION.has(port.frontConnectorType) && (
                    <select
                      className="ui-input text-xs cursor-pointer shrink-0"
                      value={port.frontGender ?? ""}
                      onChange={(e) => onUpdate({ frontGender: e.target.value === "" ? undefined : (e.target.value as Gender) })}
                      title="Front gender"
                    >
                      <option value="">—</option>
                      <option value="male">M</option>
                      <option value="female">F</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section + Notes */}
          <div className="grid grid-cols-2 gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Section group</span>
              <input
                className="ui-input text-xs"
                value={port.section ?? ""}
                onChange={(e) => onUpdate({ section: e.target.value || undefined })}
                placeholder="e.g. Cameras"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Note</span>
              <input
                className="ui-input text-xs"
                value={port.notes ?? ""}
                onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
                placeholder="e.g. East wall plate, Drop 3"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>

          {/* Port behaviour toggles */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--color-text-muted)]" style={{ fontFamily: "var(--font-mono)" }}>Behaviour</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer select-none" title="Flip port to the opposite side of the device">
                <input type="checkbox" checked={port.flipped ?? false} onChange={(e) => onUpdate({ flipped: e.target.checked || undefined })} className="cursor-pointer" />
                Flip side
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer select-none" title="Multi-connect — port accepts multiple connections (SRT, wireless, custom)">
                <input type="checkbox" checked={port.multiConnect ?? false} onChange={(e) => onUpdate({ multiConnect: e.target.checked || undefined })} className="cursor-pointer" />
                Multi-connect
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer select-none" title="Multicable trunk port (carries multiple channels)">
                <input
                  type="checkbox"
                  checked={port.isMulticable ?? false}
                  onChange={(e) => onUpdate({ isMulticable: e.target.checked || undefined, channelCount: e.target.checked ? (port.channelCount ?? 0) : undefined })}
                  className="cursor-pointer"
                />
                Multicable trunk
              </label>
              {port.isMulticable && (
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  Channels
                  <input
                    type="number"
                    min={0}
                    className="ui-input w-16 text-xs"
                    value={port.channelCount ?? 0}
                    onChange={(e) => onUpdate({ channelCount: parseInt(e.target.value) || 0 })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </label>
              )}
              {deviceType === "adapter" && (
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer select-none" title="Direct attach — plugs directly into the device, no separate cable">
                  <input type="checkbox" checked={port.directAttach ?? false} onChange={(e) => onUpdate({ directAttach: e.target.checked || undefined })} className="cursor-pointer" />
                  Direct attach
                </label>
              )}
            </div>
          </div>

          {/* Network config (addressable network signals) */}
          {NETWORK_SIGNAL_TYPES.has(port.signalType) && (
            <div className="flex flex-col gap-2 border-t border-[var(--ui-border)] pt-4">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={port.addressable !== false}
                  onChange={(e) => onUpdate({ addressable: e.target.checked ? undefined : false })}
                  className="cursor-pointer"
                />
                Addressable (has IP)
              </label>
              {port.addressable !== false && (
                <PortNetworkSection
                  config={port.networkConfig}
                  onChange={(nc) => onUpdate({ networkConfig: nc })}
                  portId={port.id}
                  poeDrawW={port.poeDrawW}
                  onPoeDrawChange={(v) => onUpdate({ poeDrawW: v })}
                  linkSpeed={port.linkSpeed}
                  onLinkSpeedChange={(v) => onUpdate({ linkSpeed: v })}
                />
              )}
            </div>
          )}

          {/* Capabilities (video signals) */}
          {VIDEO_SIGNAL_TYPES.has(port.signalType) && (
            <div className="border-t border-[var(--ui-border)] pt-4">
              <PortCapabilitiesSection
                capabilities={port.capabilities}
                onChange={(caps) => onUpdate({ capabilities: caps })}
              />
            </div>
          )}

          {/* Compatibility callout */}
          <div className="flex items-center gap-2.5 px-3.5 py-3 bg-[var(--color-surface)] border border-[var(--ui-border)] rounded-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-none">
              <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth={1.5} />
              <path d="M12 8v5M12 16v.5" stroke="var(--color-accent)" strokeWidth={1.7} strokeLinecap="round" />
            </svg>
            <span className="text-[11.5px] text-[var(--color-text)] leading-[1.45]">
              {isPassthrough ? (
                <>This passthrough circuit inherits its signal from the connection it carries. Compatible ends will highlight in Connect mode.</>
              ) : (
                <>This port accepts <b className="text-[var(--color-text-heading)]">{signalName}</b> over <b className="text-[var(--color-text-heading)]">{connName}</b>. Compatible targets will highlight in Connect mode.</>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Generic segmented control matching the comp's pill segments. */
function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-0.5 p-[3px] bg-[var(--color-surface)] border border-[var(--ui-border)] rounded-[9px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 h-[30px] rounded-md cursor-pointer text-xs font-medium transition-colors ${
              active ? "text-[var(--color-text-heading)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
            style={active ? { background: "var(--color-surface-raised)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BulkAddForm({
  direction,
  onBulkAdd,
  onClose,
}: {
  direction: PortDirection;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState("Input");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(8);
  const [signalType, setSignalType] = useState<SignalType>("sdi");
  const [section, setSection] = useState("");

  const handleSubmit = () => {
    const count = end - start + 1;
    if (count < 1 || !prefix.trim()) return;
    onBulkAdd(direction, prefix.trim(), start, count, signalType, section.trim());
    onClose();
  };

  return (
    <div className="bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded p-2 space-y-2 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className="w-20 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Prefix"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">from</span>
          <input
            type="number"
            className="w-12 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            value={start}
            onChange={(e) => setStart(parseInt(e.target.value) || 1)}
            min={0}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">to</span>
          <input
            type="number"
            className="w-12 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            value={end}
            onChange={(e) => setEnd(parseInt(e.target.value) || 1)}
            min={start}
            max={999}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <select
          className="bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded px-1 py-1 text-xs outline-none focus:border-[var(--color-accent)] cursor-pointer"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)]">Section:</span>
        <input
          className="flex-1 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="(optional)"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleSubmit}
          className="px-2 py-1 text-xs rounded bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)]">
        Preview: {prefix} {start}, {prefix} {start + 1}, ... {prefix} {end}
      </div>
    </div>
  );
}

function PortVisibilitySection({
  showAllPorts,
  setShowAllPorts,
  hiddenPorts: _hiddenPorts,
  setHiddenPorts,
  ports,
  node,
  nodes,
  templateHiddenSignals,
  setTemplateHiddenSignals,
  open,
  setOpen,
}: {
  showAllPorts: boolean;
  setShowAllPorts: (v: boolean) => void;
  hiddenPorts: string[];
  setHiddenPorts: React.Dispatch<React.SetStateAction<string[]>>;
  ports: PortDraft[];
  node: DeviceNode | undefined;
  nodes: import("../types").SchematicNode[];
  templateHiddenSignals: Record<string, SignalType[]>;
  setTemplateHiddenSignals: (templateId: string, hidden: SignalType[]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const templateId = node?.data.templateId;
  const modelLabel = node?.data.model;

  // Signal types present across all devices with this templateId
  const templateSignalTypes = useMemo(() => {
    if (!templateId) return [];
    const types = new Set<SignalType>();
    for (const n of nodes) {
      if (n.type !== "device") continue;
      if ((n.data as DeviceData).templateId !== templateId) continue;
      for (const p of (n.data as DeviceData).ports) types.add(p.signalType);
    }
    return [...types].sort() as SignalType[];
  }, [nodes, templateId]);

  const tplHidden = templateId ? (templateHiddenSignals[templateId] ?? []) : [];

  const namedPorts = ports.filter((p) => p.label.trim());

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] cursor-pointer transition-colors text-xs py-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>Port Visibility</span>
      </button>
      {open && (
        <div className="mt-1 space-y-3 pl-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllPorts}
              onChange={(e) => setShowAllPorts(e.target.checked)}
              className="w-3 h-3 accent-[var(--color-accent)] cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text)]">Show all ports (override filters)</span>
          </label>

          {namedPorts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-[var(--color-text-muted)]">Quick:</span>
                <div className="flex gap-2">
                  <button onClick={() => setHiddenPorts([])} className="text-[9px] text-[var(--color-accent)] hover:underline cursor-pointer">Show All</button>
                  <button onClick={() => setHiddenPorts(namedPorts.map((p) => p.id))} className="text-[9px] text-[var(--color-accent)] hover:underline cursor-pointer">Hide All</button>
                </div>
              </div>
            </div>
          )}

          {templateId && templateSignalTypes.length > 0 && (
            <div>
              <div className="text-[9px] text-[var(--color-text-muted)] mb-1">
                Hide on all &ldquo;{modelLabel || "this template"}&rdquo; devices:
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {templateSignalTypes.map((st) => (
                  <label key={st} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!tplHidden.includes(st)}
                      onChange={() => {
                        const next = tplHidden.includes(st)
                          ? tplHidden.filter((s) => s !== st)
                          : [...tplHidden, st];
                        setTemplateHiddenSignals(templateId, next);
                      }}
                      className="w-3 h-3 accent-[var(--color-accent)] cursor-pointer"
                    />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SIGNAL_COLORS[st] }} />
                    <span className="text-[10px] text-[var(--color-text)]">{SIGNAL_LABELS[st]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LINK_SPEED_OPTIONS = ["", "100M", "1G", "2.5G", "5G", "10G", "25G", "40G", "100G"];

function PortNetworkSection({
  config,
  onChange,
  portId,
  poeDrawW,
  onPoeDrawChange,
  linkSpeed,
  onLinkSpeedChange,
}: {
  config?: PortNetworkConfig;
  onChange: (config: PortNetworkConfig) => void;
  portId: string;
  poeDrawW?: number;
  onPoeDrawChange: (v: number | undefined) => void;
  linkSpeed?: string;
  onLinkSpeedChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = config ?? {};
  const hasData = c.ip || c.subnetMask || c.gateway || c.vlan || c.dhcp;

  // Duplicate IP detection
  const nodes = useSchematicStore((s) => s.nodes);
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const duplicateWarning = useMemo(() => {
    const ip = c.ip?.trim();
    if (!ip) return undefined;
    const dupes = findDuplicateIps(nodes);
    const entries = dupes.get(ip);
    if (!entries) return undefined;
    const others = entries.filter((e) => !(e.nodeId === editingNodeId && e.portId === portId));
    if (others.length === 0) return undefined;
    return `Duplicate IP — also used by: ${others.map((e) => `${e.deviceLabel} (${e.portLabel})`).join(", ")}`;
  }, [nodes, c.ip, editingNodeId, portId]);

  const vlanInvalid = c.vlan != null && !isValidVlan(c.vlan);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[10px] cursor-pointer transition-colors ${
          hasData ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Network{hasData ? " (configured)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 max-w-[420px]">
          <label className="flex items-center gap-1 col-span-2 text-[10px] text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={c.dhcp ?? false}
              onChange={(e) => onChange({ ...c, dhcp: e.target.checked })}
              className="cursor-pointer"
            />
            DHCP
          </label>
          <IpInput
            value={c.ip ?? ""}
            onChange={(v) => {
              const update: typeof c = { ...c, ip: v || undefined };
              if (v && isValidIpv4(v) && !c.subnetMask) update.subnetMask = "255.255.255.0";
              onChange(update);
            }}
            placeholder="IP Address"
            disabled={c.dhcp}
            duplicateWarning={duplicateWarning}
          />
          <IpInput
            value={c.subnetMask ?? ""}
            onChange={(v) => onChange({ ...c, subnetMask: v || undefined })}
            placeholder="Subnet Mask"
            disabled={c.dhcp}
            validate={isValidSubnetMask}
          />
          <IpInput
            value={c.gateway ?? ""}
            onChange={(v) => onChange({ ...c, gateway: v || undefined })}
            placeholder="Gateway"
            disabled={c.dhcp}
          />
          <input
            className={`bg-[var(--color-surface)] border rounded px-1.5 py-1 text-[10px] outline-none ${
              vlanInvalid ? "border-red-400" : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
            }`}
            type="number"
            value={c.vlan ?? ""}
            onChange={(e) => onChange({ ...c, vlan: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="VLAN"
            title={vlanInvalid ? "VLAN must be 1-4094" : undefined}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <select
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)] cursor-pointer"
            value={linkSpeed ?? ""}
            onChange={(e) => onLinkSpeedChange(e.target.value || undefined)}
          >
            {LINK_SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "Speed"}</option>
            ))}
          </select>
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            type="number"
            value={poeDrawW ?? ""}
            onChange={(e) => onPoeDrawChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="PoE (W)"
            min={0}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function DhcpServerSection({
  dhcpServer,
  onChange,
}: {
  dhcpServer: DhcpServerConfig | undefined;
  onChange: (cfg: DhcpServerConfig | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = dhcpServer ?? { enabled: false };
  const enabled = cfg.enabled;

  const startInvalid = cfg.rangeStart ? !isValidIpv4(cfg.rangeStart) : false;
  const endInvalid = cfg.rangeEnd ? !isValidIpv4(cfg.rangeEnd) : false;
  const maskInvalid = cfg.subnetMask ? !isValidSubnetMask(cfg.subnetMask) : false;
  const gatewayInvalid = cfg.gateway ? !isValidIpv4(cfg.gateway) : false;

  const handleToggle = (checked: boolean) => {
    if (checked) onChange({ ...cfg, enabled: true });
    else onChange({ ...cfg, enabled: false });
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 cursor-pointer transition-colors text-xs py-1 ${
          enabled ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        }`}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>DHCP Server{enabled ? " (active)" : ""}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2 pl-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="w-3 h-3 accent-[var(--color-accent)] cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text)]">This device serves DHCP on its network</span>
          </label>
          {enabled && (
            <div className="grid grid-cols-2 gap-1">
              <div>
                <IpInput value={cfg.rangeStart ?? ""} onChange={(v) => onChange({ ...cfg, rangeStart: v || undefined })} placeholder="Pool Start" />
                {startInvalid && <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>}
              </div>
              <div>
                <IpInput value={cfg.rangeEnd ?? ""} onChange={(v) => onChange({ ...cfg, rangeEnd: v || undefined })} placeholder="Pool End" />
                {endInvalid && <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>}
              </div>
              <div>
                <IpInput value={cfg.subnetMask ?? ""} onChange={(v) => onChange({ ...cfg, subnetMask: v || undefined })} placeholder="Subnet Mask" validate={isValidSubnetMask} />
                {maskInvalid && <div className="text-[9px] text-red-500 mt-0.5">Invalid mask</div>}
              </div>
              <div>
                <IpInput value={cfg.gateway ?? ""} onChange={(v) => onChange({ ...cfg, gateway: v || undefined })} placeholder="Gateway" />
                {gatewayInvalid && <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlotEditSection({
  nodeId,
  installedSlots,
  slotDefs,
}: {
  nodeId: string;
  installedSlots: NonNullable<DeviceData["slots"]>;
  slotDefs: SlotDefinition[];
}) {
  const swapCard = useSchematicStore((s) => s.swapCard);
  const addSlot = useSchematicStore((s) => s.addSlot);
  const updateSlot = useSchematicStore((s) => s.updateSlot);
  const removeSlot = useSchematicStore((s) => s.removeSlot);
  const edges = useSchematicStore((s) => s.edges);
  const customTemplates = useSchematicStore((s) => s.customTemplates);

  const [creatingCardForSlot, setCreatingCardForSlot] = useState<string | null>(null);

  const knownFamilies = useMemo(
    () => [
      ...new Set([
        ...getBundledTemplates().map((t) => t.slotFamily),
        ...customTemplates.map((t) => t.slotFamily),
      ].filter((f): f is string => !!f)),
    ],
    [customTemplates],
  );

  const creatingSlot = creatingCardForSlot ? installedSlots.find((s) => s.slotId === creatingCardForSlot) : undefined;

  // Hidden entirely when there are no slots and no template-defined slots to add — keeps the
  // left rail tidy for devices without modular bays. (Add Slot still surfaces when slotDefs exist.)
  if (installedSlots.length === 0 && slotDefs.length === 0) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
          Expansion Slots
        </summary>
        <div className="pt-1 pl-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)] italic">No expansion slots.</span>
          <button
            type="button"
            onClick={() => addSlot(nodeId, { label: "Slot 1", slotFamily: "" })}
            className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer"
          >
            + Add Slot
          </button>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
          Expansion Slots{installedSlots.length > 0 ? ` (${installedSlots.filter((s) => !s.parentSlotId).length})` : ""}
        </div>
        <button
          type="button"
          onClick={() => addSlot(nodeId, { label: `Slot ${installedSlots.filter((s) => !s.parentSlotId).length + 1}`, slotFamily: "" })}
          className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          + Add Slot
        </button>
      </div>
      <datalist id={`slot-families-${nodeId}`}>
        {knownFamilies.map((f) => <option key={f} value={f} />)}
      </datalist>
      {installedSlots.map((slot) => {
        const family = slot.slotFamily ?? slotDefs.find((d) => d.id === slot.slotId)?.slotFamily;
        const familyCards = family ? getCardsByFamily(family, customTemplates) : [];
        const isNested = !!slot.parentSlotId;

        const descendantPortIds = isNested ? [] : installedSlots
          .filter((s) => s.parentSlotId?.startsWith(slot.slotId))
          .flatMap((s) => s.portIds);
        const allPortIds = new Set([...slot.portIds, ...descendantPortIds]);
        const connCount = edges.filter((e) => {
          if (e.source === nodeId && allPortIds.has(e.sourceHandle ?? "")) return true;
          if (e.target === nodeId && allPortIds.has(e.targetHandle ?? "")) return true;
          if (e.source === nodeId && allPortIds.has((e.sourceHandle ?? "").replace(/-(in|out|rear|front)$/, ""))) return true;
          if (e.target === nodeId && allPortIds.has((e.targetHandle ?? "").replace(/-(in|out|rear|front)$/, ""))) return true;
          return false;
        }).length;

        return (
          <div
            key={slot.slotId}
            className={`bg-[var(--color-surface)] rounded px-2 py-1.5 border border-[var(--color-border)] ${isNested ? "ml-3 border-dashed" : ""}`}
          >
            {isNested ? (
              <div className="text-[10px] text-[var(--color-text-muted)] mb-1">{slot.label}</div>
            ) : (
              <div className="flex items-center gap-1 mb-1">
                <input
                  value={slot.label}
                  onChange={(e) => updateSlot(nodeId, slot.slotId, { label: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Slot label"
                  className="flex-1 min-w-0 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                />
                <input
                  value={slot.slotFamily ?? ""}
                  onChange={(e) => updateSlot(nodeId, slot.slotId, { slotFamily: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  list={`slot-families-${nodeId}`}
                  placeholder="family"
                  className="w-24 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-[var(--color-accent)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const warnConn = connCount > 0 ? `This slot has ${connCount} connection(s) that will be disconnected. ` : "";
                    const warnCard = slot.cardTemplateId ? "The installed card and its ports will be removed. " : "";
                    if ((warnConn || warnCard) && !confirm(`${warnConn}${warnCard}Remove slot "${slot.label}"?`)) return;
                    removeSlot(nodeId, slot.slotId);
                  }}
                  className="text-red-400 hover:text-red-500 text-xs cursor-pointer px-1 leading-none"
                  title="Remove slot"
                >
                  &times;
                </button>
              </div>
            )}
            <select
              value={slot.cardTemplateId ?? ""}
              onChange={(e) => {
                const newCardId = e.target.value || null;
                if (newCardId === slot.cardTemplateId) return;
                if (connCount > 0) {
                  if (!confirm(`Swapping this card will disconnect ${connCount} connection(s). Continue?`)) return;
                }
                swapCard(nodeId, slot.slotId, newCardId);
              }}
              disabled={!isNested && !slot.slotFamily}
              className="w-full bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
            >
              <option value="">{!isNested && !slot.slotFamily ? "(set slot family to enable)" : "(empty)"}</option>
              {familyCards.map((card) => (
                <option key={card.id} value={card.id!}>
                  {card.label}
                </option>
              ))}
            </select>
            {slot.cardLabel && (
              <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                {[slot.cardManufacturer, slot.cardModelNumber].filter(Boolean).join(" ")}
              </div>
            )}
            {!isNested && (
              <button
                type="button"
                onClick={() => setCreatingCardForSlot(slot.slotId)}
                className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer mt-1"
              >
                + Create custom card...
              </button>
            )}
          </div>
        );
      })}
      {creatingSlot && (
        <CardCreatorDialog
          open
          initialFamily={creatingSlot.slotFamily ?? ""}
          familySuggestions={knownFamilies}
          onClose={() => setCreatingCardForSlot(null)}
          onCreated={(cardId, finalFamily) => {
            if ((creatingSlot.slotFamily ?? "") !== finalFamily) {
              updateSlot(nodeId, creatingSlot.slotId, { slotFamily: finalFamily });
            }
            swapCard(nodeId, creatingSlot.slotId, cardId);
            setCreatingCardForSlot(null);
          }}
        />
      )}
    </div>
  );
}

function PortCapabilitiesSection({
  capabilities,
  onChange,
}: {
  capabilities?: PortCapabilities;
  onChange: (caps: PortCapabilities) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = capabilities ?? {};
  const hasData = c.maxResolution || c.maxFrameRate || c.maxBitDepth;

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[10px] cursor-pointer transition-colors ${
          hasData ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Capabilities{hasData ? " (set)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 max-w-[420px]">
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            value={c.maxResolution ?? ""}
            onChange={(e) => onChange({ ...c, maxResolution: e.target.value || undefined })}
            placeholder="Max Resolution (e.g. 3840x2160)"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            type="number"
            value={c.maxFrameRate ?? ""}
            onChange={(e) => onChange({ ...c, maxFrameRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Max FPS"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            type="number"
            value={c.maxBitDepth ?? ""}
            onChange={(e) => onChange({ ...c, maxBitDepth: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Bit Depth"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[10px] outline-none focus:border-[var(--color-accent)]"
            value={c.colorSpaces?.join(", ") ?? ""}
            onChange={(e) => onChange({ ...c, colorSpaces: e.target.value ? e.target.value.split(",").map((s) => s.trim()) : undefined })}
            placeholder="Color Spaces (comma sep)"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
