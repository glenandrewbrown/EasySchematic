"""
Curated source list for the EasySchematic SVG symbol library.

Each entry: (subcategory, id, raw_url, force_current_color)
- id: kebab-case file stem (also the manifest id within its category)
- raw_url: a raw.githubusercontent.com URL to a single .svg
- force_current_color: True  -> rewrite stroke/fill to currentColor (monochrome line-art)
                       False -> leave colours as authored (deliberately multi-tone art)

Sources are grouped by REPO so license/attribution can be attached once.
"""

# ---------------------------------------------------------------------------
# Repos -> license / attribution metadata (single source of truth)
# ---------------------------------------------------------------------------
REPOS = {
    "tabler": {
        "name": "Tabler Icons",
        "base": "https://raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/",
        "source": "https://github.com/tabler/tabler-icons",
        "license": "MIT",
        "attribution": "Tabler Icons (tabler.io/icons) — MIT License, © Paweł Kuna",
    },
    "lucide": {
        "name": "Lucide",
        "base": "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/",
        "source": "https://github.com/lucide-icons/lucide",
        "license": "ISC",
        "attribution": "Lucide (lucide.dev) — ISC License, © Lucide Contributors. Forked from Feather (MIT, © Cole Bemis).",
    },
    "bootstrap": {
        "name": "Bootstrap Icons",
        "base": "https://raw.githubusercontent.com/twbs/icons/main/icons/",
        "source": "https://github.com/twbs/icons",
        "license": "MIT",
        "attribution": "Bootstrap Icons (icons.getbootstrap.com) — MIT License, © The Bootstrap Authors",
    },
    "material": {
        "name": "Material Symbols",
        "base": "https://raw.githubusercontent.com/marella/material-symbols/main/svg/400/outlined/",
        "source": "https://github.com/google/material-design-icons",
        "license": "Apache-2.0",
        "attribution": "Material Symbols (fonts.google.com/icons) — Apache License 2.0, © Google",
    },
    "fontawesome": {
        "name": "Font Awesome Free",
        "base": "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/",
        "source": "https://github.com/FortAwesome/Font-Awesome",
        "license": "CC-BY-4.0",
        "attribution": "Font Awesome Free 6 (fontawesome.com) — Icons: CC BY 4.0 License, © Fonticons, Inc.",
    },
    "gameicons": {
        "name": "game-icons.net",
        "base": "https://raw.githubusercontent.com/game-icons/icons/master/",
        "source": "https://github.com/game-icons/icons",
        "license": "CC-BY-3.0",
        "attribution": "game-icons.net — CC BY 3.0 License. Authors credited per icon (Delapouite, Lorc, et al.).",
    },
}

# game-icons author credit per file-stem (for attribution precision)
GAMEICON_AUTHORS = {
    "delapouite": "Delapouite (delapouite.com)",
    "lorc": "Lorc (lorcblog.blogspot.com)",
    "skoll": "Skoll",
    "sbed": "Sbed",
    "carl-olsen": "Carl Olsen",
}

# ---------------------------------------------------------------------------
# CURATED ENTRIES per category.
# Format per row: (subcategory, id, repo_key, path_after_base, force_cc)
# force_cc True => currentColor rewrite (line-art). game-icons are kept as-authored (white-on-mask) -> we recolor to currentColor too since they are single-path monochrome.
# ---------------------------------------------------------------------------

GENERIC = [
    # diagram primitives & general shapes
    ("rectangle", "rectangle", "tabler", "rectangle.svg", True),
    ("rounded-rect", "rounded-rectangle", "tabler", "square-rounded.svg", True),
    ("circle", "circle", "tabler", "circle.svg", True),
    ("circle", "circle-lucide", "lucide", "circle.svg", True),
    ("ellipse", "ellipse", "tabler", "oval-vertical.svg", True),
    ("triangle", "triangle", "tabler", "triangle.svg", True),
    ("triangle", "triangle-bootstrap", "bootstrap", "triangle.svg", True),
    ("line", "line", "tabler", "line.svg", True),
    ("line", "line-dashed", "tabler", "line-dashed.svg", True),
    ("arrow", "arrow-right", "tabler", "arrow-right.svg", True),
    ("arrow", "arrow-narrow-right", "tabler", "arrow-narrow-right.svg", True),
    ("double-arrow", "arrows-horizontal", "tabler", "arrows-horizontal.svg", True),
    ("double-arrow", "arrow-left-right", "lucide", "arrow-left-right.svg", True),
    ("text-label", "text-label", "tabler", "text-size.svg", True),
    ("text-label", "letter-t", "tabler", "letter-t.svg", True),
    ("callout", "callout-speech", "tabler", "message.svg", True),
    ("callout", "callout-corner", "lucide", "message-square.svg", True),
    ("zone-area", "zone-rectangle-dashed", "tabler", "square-dashed.svg", True),
    ("zone-area", "zone-polygon", "tabler", "polygon.svg", True),
    ("bracket-group", "bracket", "tabler", "brackets.svg", True),
    ("bracket-group", "brace", "tabler", "braces.svg", True),
    ("dimension-marker", "ruler-measure", "tabler", "ruler-measure.svg", True),
    ("dimension-marker", "ruler", "tabler", "ruler.svg", True),
    ("dimension-marker", "dimensions", "tabler", "dimensions.svg", True),
    ("north-arrow", "north-arrow-compass", "tabler", "compass.svg", True),
    ("north-arrow", "navigation", "lucide", "navigation.svg", True),
    ("scale-bar", "scale-ruler-2", "tabler", "ruler-2.svg", True),
    ("grid", "grid-dots", "tabler", "grid-dots.svg", True),
    ("grid", "grid", "tabler", "grid-4x4.svg", True),
    ("plus", "plus", "tabler", "plus.svg", True),
    ("cross", "x", "tabler", "x.svg", True),
    ("star", "star", "tabler", "star.svg", True),
    ("hexagon", "hexagon", "tabler", "hexagon.svg", True),
]

AUDIO = [
    # speakers
    ("loudspeaker", "loudspeaker", "tabler", "speakerphone.svg", True),
    ("loudspeaker", "speaker-fa", "fontawesome", "solid/volume-high.svg", True),
    ("line-array", "line-array", "gameicons", "delapouite/speaker.svg", True),
    ("point-source", "point-source-speaker", "material", "speaker.svg", True),
    ("subwoofer", "subwoofer", "material", "subwoofer.svg", True),
    ("subwoofer", "subwoofer-speaker", "material", "speaker_group.svg", True),
    ("stage-monitor", "stage-monitor-wedge", "gameicons", "delapouite/speaker.svg", True),
    ("column-speaker", "column-speaker", "tabler", "device-speaker.svg", True),
    ("ceiling-speaker", "ceiling-speaker", "material", "surround_sound.svg", True),
    # microphones
    ("microphone-handheld", "microphone-handheld", "tabler", "microphone.svg", True),
    ("microphone-handheld", "microphone-fa", "fontawesome", "solid/microphone.svg", True),
    ("microphone-condenser", "microphone-condenser", "gameicons", "delapouite/microphone.svg", True),
    ("microphone-lavalier", "microphone-lavalier", "fontawesome", "solid/microphone-lines.svg", True),
    ("microphone-boundary", "microphone-boundary", "material", "mic_external_on.svg", True),
    ("microphone-studio", "microphone-studio", "material", "mic.svg", True),
    # consoles / amps / processing
    ("mixing-console", "mixing-console", "material", "graphic_eq.svg", True),
    ("mixing-console", "mixer-faders", "tabler", "adjustments.svg", True),
    ("mixing-console", "mixing-desk", "gameicons", "delapouite/sound-on.svg", True),
    ("power-amplifier", "power-amplifier", "tabler", "settings-bolt.svg", True),
    ("power-amplifier", "amplifier-fa", "fontawesome", "solid/sliders.svg", True),
    ("dsp-processor", "dsp-processor", "material", "tune.svg", True),
    ("dsp-processor", "equalizer", "tabler", "adjustments-horizontal.svg", True),
    ("di-box", "di-box", "tabler", "box.svg", True),
    # I/O & transport
    ("stage-box-snake", "stage-box-snake", "tabler", "plug-connected.svg", True),
    ("media-player", "media-player", "tabler", "player-play.svg", True),
    ("media-player", "playlist", "tabler", "playlist.svg", True),
    # wireless
    ("wireless-mic", "wireless-mic", "material", "mic.svg", True),
    ("iem", "iem-in-ear-monitor", "tabler", "headphones.svg", True),
    ("antenna", "antenna", "tabler", "antenna.svg", True),
    ("antenna", "broadcast-tower", "fontawesome", "solid/tower-broadcast.svg", True),
    ("antenna", "podcast-rf", "material", "podcasts.svg", True),
    # misc
    ("headphones", "headphones", "tabler", "headphones.svg", True),
    ("headphones", "headphones-fa", "fontawesome", "solid/headphones.svg", True),
    ("waveform", "waveform", "tabler", "wave-sine.svg", True),
]

NETWORK = [
    ("switch", "network-switch", "tabler", "switch-3.svg", True),
    ("switch", "switch-horizontal", "tabler", "switch-horizontal.svg", True),
    ("router", "router", "tabler", "router.svg", True),
    ("router", "router-fa", "fontawesome", "solid/network-wired.svg", True),
    ("access-point", "wireless-access-point", "tabler", "access-point.svg", True),
    ("access-point", "wifi", "tabler", "wifi.svg", True),
    ("firewall", "firewall", "tabler", "wall.svg", True),
    ("firewall", "shield-firewall", "tabler", "shield-lock.svg", True),
    ("server", "server", "tabler", "server.svg", True),
    ("server", "server-2", "tabler", "server-2.svg", True),
    ("server", "server-fa", "fontawesome", "solid/server.svg", True),
    ("nas", "nas-database", "tabler", "database.svg", True),
    ("nas", "nas-stack", "tabler", "stack-2.svg", True),
    ("patch-panel", "patch-panel", "tabler", "layout-grid.svg", True),
    ("media-converter", "media-converter", "tabler", "transfer.svg", True),
    ("nic-endpoint", "nic-endpoint-desktop", "tabler", "device-desktop.svg", True),
    ("nic-endpoint", "ethernet-port", "fontawesome", "solid/ethernet.svg", True),
    ("cloud", "cloud", "tabler", "cloud.svg", True),
    ("cloud", "cloud-network", "tabler", "cloud-computing.svg", True),
    ("modem", "modem", "tabler", "device-landline-phone.svg", True),
    ("modem", "modem-router", "material", "router.svg", True),
    ("poe-injector", "poe-injector", "tabler", "plug.svg", True),
    ("equipment-rack", "equipment-rack", "tabler", "server-cog.svg", True),
    ("equipment-rack", "rack-fa", "fontawesome", "solid/server.svg", True),
    ("network-topology", "topology-star", "tabler", "topology-star.svg", True),
    ("network-topology", "topology-ring", "tabler", "topology-ring.svg", True),
]

FURNITURE = [
    ("chair", "chair", "material", "chair.svg", True),
    ("chair", "chair-gameicon", "gameicons", "delapouite/wooden-chair.svg", True),
    ("stackable-chair", "stackable-chair", "material", "chair_alt.svg", True),
    ("round-table", "round-table", "gameicons", "delapouite/round-table.svg", True),
    ("round-table", "round-table-restaurant", "material", "table_restaurant.svg", True),
    ("rectangular-table", "rectangular-table", "gameicons", "delapouite/table.svg", True),
    ("banquet-table", "banquet-table", "material", "table_bar.svg", True),
    ("cocktail-table", "cocktail-poseur-table", "material", "table_bar.svg", True),
    ("stage-deck", "stage-deck-riser", "material", "deck.svg", True),
    ("stage-deck", "stage-platform", "gameicons", "delapouite/theater.svg", True),
    ("truss-segment", "truss-segment", "tabler", "grid-pattern.svg", True),
    ("speaker-stand", "speaker-stand-tripod", "tabler", "tournament.svg", True),
    ("mic-stand", "mic-stand", "gameicons", "delapouite/microphone.svg", True),
    ("lectern-podium", "lectern-podium", "gameicons", "delapouite/podium.svg", True),
    ("lectern-podium", "podium-speaker", "material", "co_present.svg", True),
    ("dj-booth", "dj-booth", "gameicons", "delapouite/audio-cassette.svg", True),
    ("plant-tree", "plant-tree", "material", "park.svg", True),
    ("plant-tree", "potted-plant", "material", "potted_plant.svg", True),
    ("door", "door", "material", "door_front.svg", True),
    ("door", "door-open", "material", "door_open.svg", True),
    ("window", "window", "material", "window.svg", True),
    ("double-door", "double-door", "material", "sensor_door.svg", True),
    ("pillar-column", "pillar-column", "gameicons", "delapouite/greek-temple.svg", True),
    ("pipe-and-drape", "pipe-and-drape", "material", "curtains.svg", True),
    ("bar", "bar-counter", "material", "local_bar.svg", True),
    ("sofa", "sofa", "material", "weekend.svg", True),
    ("sofa", "sofa-couch", "tabler", "sofa.svg", True),
    ("person-audience", "person-audience", "material", "person.svg", True),
    ("person-audience", "people-group", "tabler", "users-group.svg", True),
    ("lighting", "lighting-fixture", "material", "light.svg", True),
    ("dancefloor", "dancefloor", "gameicons", "delapouite/ballerina-shoes.svg", True),
]
