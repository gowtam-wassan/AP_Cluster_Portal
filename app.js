/**
 * AP CLUSTER REARRANGEMENT - INTERACTIVE SPATIAL DASHBOARD & CLUSTER VISUALIZER
 * Unified Cluster Color Default, Phase Classification Action & District Mandal Label Badges
 */

let appData = null;
let map = null;
let activeBasemap = 'satellite';
let basemapLayers = {};

let districtLayerGroup  = null;
let baseMandalLayer     = null;  // always-on: ALL cluster mandals in unified blue
let overlapLayerGroup   = null;  // always-on: stripe pattern where 2+ layers share a mandal
let labelLayerGroup     = null;

// Separate layer groups for each scenario
let layerExisting  = null;
let layerScenario1 = null;
let layerScenario2 = null;
let layerBreads    = null;

// Maps per layer: mandal_lgd -> L.GeoJSON feature layer (per scenario)
const existingLayerMap  = new Map();
const scenario1LayerMap = new Map();
const scenario2LayerMap = new Map();
const breadsLayerMap    = new Map();

// Unified mandal data map
const mandalDataMap = new Map(); // mandal_lgd -> properties
let selectedLgd = null;

// Classification Mode: 'unified' | 'phase' | 'scenario'
let classificationMode = 'unified';

// Charts
let phaseChartInstance = null;
let scenarioChartInstance = null;

// Scenario layer style configs
const SCENARIO_STYLES = {
  'Existing':   { color: '#ec4899', label: 'Existing (Scenario 0)',    icon: '🌸' },
  'Scenario 1': { color: '#16a34a', label: 'Scenario 1 (Rearranged 50)', icon: '🟢' },
  'Scenario 2': { color: '#9333ea', label: 'Scenario 2 (Additional 50)', icon: '🟣' },
  'Breads':     { color: '#eab308', label: 'Breads (33)',                icon: '🟡' },
};

// Filter State
let filterState = {
  search: '',
  district: '',
  phaseSelect: '',
  allClusters: true,
  existing: false,
  scenario1: false,
  scenario2: false,
  breads: false
};

// Helper to deduplicate scenario layers array (prevents duplicate badges like 'Existing', 'Existing')
function getUniqueLayers(layers) {
  if (!layers || !Array.isArray(layers)) return [];
  const unique = [];
  layers.forEach(l => {
    if (l && !unique.includes(l)) unique.push(l);
  });
  return unique;
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  initMap();
  loadData();
  setupEventListeners();
}

// Sidebar Offset Helper for Centering Map Relative to Left Panel
function getSidebarPadding(basePad = 30) {
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar && sidebar.classList.contains('collapsed');
  const isMobile = window.innerWidth <= 768;

  if (!isMobile && !isCollapsed) {
    return {
      paddingTopLeft: [410, basePad],
      paddingBottomRight: [basePad, basePad]
    };
  }
  return { padding: [basePad, basePad] };
}

// 1. Initialize Leaflet Map
function initMap() {
  map = L.map('map', {
    center: [15.9129, 79.7400],
    zoom: 7,
    zoomControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Basemap Tile Layers
  basemapLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  });

  basemapLayers['osm'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  basemapLayers['light'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  });

  basemapLayers['dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  });

  // Default to Satellite Imagery
  basemapLayers['satellite'].addTo(map);

  districtLayerGroup = L.layerGroup().addTo(map);

  // Base mandal outline layer — always visible, drawn below scenario layers
  baseMandalLayer = L.layerGroup().addTo(map);

  // Each scenario gets its own Leaflet layer group (stacked lowest → highest)
  layerExisting  = L.layerGroup().addTo(map);
  layerScenario1 = L.layerGroup().addTo(map);
  layerScenario2 = L.layerGroup().addTo(map);
  layerBreads    = L.layerGroup().addTo(map);

  // Overlap pattern layer — sits on top of all scenario layers, below labels
  overlapLayerGroup = L.layerGroup().addTo(map);

  labelLayerGroup = L.layerGroup().addTo(map);
}

// 2. Basemap Switcher Handler
window.setBasemap = function(style) {
  if (basemapLayers[activeBasemap]) {
    map.removeLayer(basemapLayers[activeBasemap]);
  }
  if (basemapLayers[style]) {
    basemapLayers[style].addTo(map);
    activeBasemap = style;
  }
};

// 3. Reset Zoom Handler (Centered with Respect to Left Sidebar Offset)
window.resetMapZoom = function() {
  if (labelLayerGroup) labelLayerGroup.clearLayers();
  // Try to get bounds from any active scenario layer
  const allGroups = [baseMandalLayer, layerExisting, layerScenario1, layerScenario2, layerBreads].filter(Boolean);
  let boundsSet = false;
  for (const grp of allGroups) {
    const layers = grp.getLayers();
    if (layers.length > 0) {
      try {
        const bounds = layers[0].getBounds ? layers[0].getBounds() : null;
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, getSidebarPadding(30));
          boundsSet = true;
          break;
        }
      } catch(e) {}
    }
  }
  if (!boundsSet) map.setView([15.9129, 79.7400], 7);
};

// 4. Load Data Payload
async function loadData() {
  try {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = '50%';

    if (window.processedClusterData) {
      appData = window.processedClusterData;
    } else {
      const response = await fetch('data/processed_cluster_data.json');
      if (!response.ok) {
        throw new Error(`Failed to load dataset: ${response.statusText}`);
      }
      appData = await response.json();
    }
    
    if (progressFill) progressFill.style.width = '100%';
    setTimeout(() => {
      document.getElementById('loader').classList.add('hidden');
    }, 300);

    updateHeaderStats(appData.stats);
    populateDistrictDropdown(appData);
    renderMapLayers(appData);
    renderMandalList();
    renderAnalyticsCharts();
    renderAuditLog(appData.audit_log);
    updateLegendUI();
  } catch (err) {
    console.error('Error loading dataset:', err);
    alert('Unable to load processed GIS dataset. Ensure scripts/build_data.py has been run.');
  }
}

// 5. Update Header & Stats Box
function updateHeaderStats(stats) {
  document.getElementById('statDistricts').textContent = stats.total_districts;
  document.getElementById('statMandals').textContent = stats.total_mandals;
  document.getElementById('statClusters').textContent = stats.clusters_rows;
}

// 6. Populate District Select Dropdown
function populateDistrictDropdown(data) {
  const distSelect = document.getElementById('districtSelect');
  const districtSet = new Set();
  
  data.mandals.features.forEach(f => {
    if (f.properties.district) districtSet.add(f.properties.district);
  });

  const sortedDists = Array.from(districtSet).sort();
  sortedDists.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    distSelect.appendChild(opt);
  });
}

// 7. Dynamic Color Helper (per scenario or phase-wise)
function getMandalColor(props, scenarioKey) {
  const isAssigned = props.cluster_count > 0 || (props.layers && props.layers.length > 0);
  if (!isAssigned) return 'rgba(255, 255, 255, 0.15)';

  if (classificationMode === 'phase') {
    const cat = props.phase_category || '';
    if (cat === 'Phase 1') return '#f59e0b';
    if (cat === 'Phase 2') return '#10b981';
    if (cat === 'Phase 3') return '#d946ef';
    if (cat.startsWith('Multi')) return '#06b6d4';
    return '#94a3b8';
  }

  // If rendering a specific scenario layer, return its distinct layer color
  if (scenarioKey && SCENARIO_STYLES[scenarioKey]) {
    return SCENARIO_STYLES[scenarioKey].color;
  }

  if (classificationMode === 'scenario') {
    const layers = getUniqueLayers(props.layers || []);
    if (layers.length > 1) return '#f59e0b';
    if (layers.includes('Existing'))   return SCENARIO_STYLES['Existing'].color;
    if (layers.includes('Scenario 1')) return SCENARIO_STYLES['Scenario 1'].color;
    if (layers.includes('Scenario 2')) return SCENARIO_STYLES['Scenario 2'].color;
    if (layers.includes('Breads'))     return SCENARIO_STYLES['Breads'].color;
    return '#94a3b8';
  }

  return '#2563eb'; // base unified blue for "All AP Clusters" background layer
}

// 8. Build one GeoJSON layer for a specific scenario key ('Existing' | 'Scenario 1' | 'Scenario 2')
function buildScenarioGeoJson(data, scenarioKey, layerMap) {
  layerMap.clear();

  const style = SCENARIO_STYLES[scenarioKey];
  const color = style.color;

  // Filter features that belong to this scenario
  const scenarioFeatures = {
    type: 'FeatureCollection',
    features: data.mandals.features.filter(f => f.properties.layers.includes(scenarioKey))
  };

  const geoJson = L.geoJSON(scenarioFeatures, {
    style: (feature) => {
      const props = feature.properties;
      const isDistrictActive = !filterState.district || props.district === filterState.district;
      const isPhaseActive = !filterState.phaseSelect
        || (filterState.phaseSelect === 'Multi-Phase'
          ? props.phase_category.startsWith('Multi')
          : props.phases.includes(filterState.phaseSelect));
      const isActive = isDistrictActive && isPhaseActive;

      const dynamicColor = getMandalColor(props, scenarioKey);

      return {
        fillColor: dynamicColor,
        fillOpacity: isActive ? 0.72 : 0.05,
        color: classificationMode === 'phase' ? '#ffffff' : '#000000',
        weight: isActive ? 1.2 : 0.3
      };
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const lgd = props.mandal_lgd;

      layerMap.set(lgd, layer);
      mandalDataMap.set(lgd, props);

      // Tooltip with deduplicated scenario badges
      const uniqueLayers = getUniqueLayers(props.layers);
      const scenarioBadges = uniqueLayers.length > 0
        ? uniqueLayers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
        : '<span class="badge-chip" style="background:#e2e8f0;color:#64748b;">No Scenario</span>';
      const phaseBadge = props.phase_category !== 'Unassigned'
        ? `<span class="pill" style="background:rgba(37,99,235,0.12);color:#2563eb;">${props.phase_category}</span>`
        : '<span class="pill" style="background:#e2e8f0;color:#64748b;">Unassigned</span>';

      layer.bindTooltip(`
        <div style="font-family:Inter,sans-serif;padding:4px;color:#0f172a;">
          <div style="font-size:0.95rem;font-weight:800;color:#0f172a;">${props.mandal}</div>
          <div style="font-size:0.75rem;color:#64748b;">${props.district} District (LGD: ${lgd})</div>
          <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;">
            <span style="font-size:0.72rem;font-weight:700;padding:2px 6px;border-radius:4px;background:${color}22;color:${color};border:1px solid ${color}55;">${scenarioKey}</span>
            ${phaseBadge}
          </div>
          <div style="margin-top:5px;">${scenarioBadges}</div>
          ${props.cluster_count > 0 ? `<div style="margin-top:4px;font-size:0.7rem;color:${color};font-weight:700;">● ${props.cluster_count} Cluster(s)</div>` : ''}
        </div>
      `, { sticky: true, opacity: 0.98 });

      layer.on({
        mouseover: (e) => {
          e.target.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.92 });
          e.target.bringToFront();
          highlightListItem(lgd, true);
        },
        mouseout: (e) => {
          if (selectedLgd === lgd) {
            e.target.setStyle({ fillColor: '#f97316', fillOpacity: 0.92, color: '#ffffff', weight: 3.0 });
          } else {
            const isDistrictActive = !filterState.district || props.district === filterState.district;
            const isPhaseActive = !filterState.phaseSelect
              || (filterState.phaseSelect === 'Multi-Phase'
                ? props.phase_category.startsWith('Multi')
                : props.phases.includes(filterState.phaseSelect));
            const isActive = isDistrictActive && isPhaseActive;
            const dynamicColor = getMandalColor(props, scenarioKey);
            e.target.setStyle({
              fillColor: dynamicColor,
              fillOpacity: isActive ? 0.72 : 0.05,
              color: classificationMode === 'phase' ? '#ffffff' : '#000000',
              weight: isActive ? 1.2 : 0.3
            });
          }
          highlightListItem(lgd, false);
        },
        click: () => selectMandal(lgd)
      });
    }
  });

  return geoJson;
}

// 8b. Render all scenario layers onto map
function renderMapLayers(data) {
  districtLayerGroup.clearLayers();
  baseMandalLayer.clearLayers();
  layerExisting.clearLayers();
  layerScenario1.clearLayers();
  layerScenario2.clearLayers();
  layerBreads.clearLayers();
  existingLayerMap.clear();
  scenario1LayerMap.clear();
  scenario2LayerMap.clear();
  breadsLayerMap.clear();
  mandalDataMap.clear();

  // A. District Outline Boundaries ONLY for districts present in Excel sheet (bold black borders)
  const excelDistricts = new Set();
  data.mandals.features.forEach(f => {
    const p = f.properties;
    if (p.cluster_count > 0 || (p.layers && p.layers.length > 0)) {
      excelDistricts.add(p.district);
    }
  });

  const filteredDistricts = {
    type: 'FeatureCollection',
    features: data.districts.features.filter(d => excelDistricts.has(d.properties.district))
  };

  const districtGeoJson = L.geoJSON(filteredDistricts, {
    style: {
      color: '#000000',
      weight: 2.5,
      opacity: 1.0,
      fill: false
    },
    interactive: false
  });
  districtLayerGroup.addLayer(districtGeoJson);

  // A2. Base mandal layer — ALL AP cluster mandals with bold black outline & interactive tooltips
  const baseMandal = L.geoJSON(data.mandals, {
    style: (feature) => {
      const p = feature.properties;
      const isCluster = p.cluster_count > 0 || (p.layers && p.layers.length > 0);
      const isDistrictActive = !filterState.district || p.district === filterState.district;
      const isPhaseActive = !filterState.phaseSelect
        || (filterState.phaseSelect === 'Multi-Phase'
          ? p.phase_category.startsWith('Multi')
          : p.phases.includes(filterState.phaseSelect));
      const isActive = isDistrictActive && isPhaseActive;
      const dynamicColor = getMandalColor(p, null);

      return {
        fillColor:   isCluster ? dynamicColor : 'transparent',
        fillOpacity: isActive ? (isCluster ? 0.65 : 0) : 0.05,
        color:       isCluster ? '#000000' : '#cbd5e1',
        weight:      isCluster ? 1.6 : 0.4,
        opacity:     isActive ? 1.0 : 0.2
      };
    },
    interactive: true,
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const lgd = props.mandal_lgd;

      mandalDataMap.set(lgd, props);

      // Tooltip for Base All AP Clusters Layer
      const uniqueLayers = getUniqueLayers(props.layers);
      const scenarioBadges = uniqueLayers.length > 0
        ? uniqueLayers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
        : '<span class="badge-chip" style="background:#e2e8f0;color:#64748b;">Unassigned</span>';
      const phaseBadge = props.phase_category !== 'Unassigned'
        ? `<span class="pill" style="background:rgba(37,99,235,0.12);color:#2563eb;">${props.phase_category}</span>`
        : '<span class="pill" style="background:#e2e8f0;color:#64748b;">Unassigned</span>';

      layer.bindTooltip(`
        <div style="font-family:Inter,sans-serif;padding:4px;color:#0f172a;">
          <div style="font-size:0.95rem;font-weight:800;color:#0f172a;">${props.mandal}</div>
          <div style="font-size:0.75rem;color:#64748b;">${props.district} District (LGD: ${lgd})</div>
          <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;">
            ${phaseBadge}
          </div>
          <div style="margin-top:5px;">${scenarioBadges}</div>
          ${props.cluster_count > 0 ? `<div style="margin-top:4px;font-size:0.7rem;color:#2563eb;font-weight:700;">● ${props.cluster_count} Cluster(s)</div>` : ''}
        </div>
      `, { sticky: true, opacity: 0.98 });

      layer.on({
        mouseover: (e) => {
          e.target.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.92 });
          e.target.bringToFront();
          highlightListItem(lgd, true);
        },
        mouseout: (e) => {
          if (selectedLgd === lgd) {
            e.target.setStyle({ fillColor: '#f97316', fillOpacity: 0.92, color: '#ffffff', weight: 3.0 });
          } else {
            const isCluster = props.cluster_count > 0 || (props.layers && props.layers.length > 0);
            const isDistrictActive = !filterState.district || props.district === filterState.district;
            const isPhaseActive = !filterState.phaseSelect
              || (filterState.phaseSelect === 'Multi-Phase'
                ? props.phase_category.startsWith('Multi')
                : props.phases.includes(filterState.phaseSelect));
            const isActive = isDistrictActive && isPhaseActive;
            const dynamicColor = getMandalColor(props, null);
            e.target.setStyle({
              fillColor:   isCluster ? dynamicColor : 'transparent',
              fillOpacity: isActive ? (isCluster ? 0.65 : 0) : 0.05,
              color:       isCluster ? '#000000' : '#cbd5e1',
              weight:      isCluster ? 1.6 : 0.4,
              opacity:     isActive ? 1.0 : 0.2
            });
          }
          highlightListItem(lgd, false);
        },
        click: () => selectMandal(lgd)
      });
    }
  });
  baseMandalLayer.addLayer(baseMandal);

  // B. Four separate scenario GeoJSON layers
  const gExisting  = buildScenarioGeoJson(data, 'Existing',   existingLayerMap);
  const gScenario1 = buildScenarioGeoJson(data, 'Scenario 1', scenario1LayerMap);
  const gScenario2 = buildScenarioGeoJson(data, 'Scenario 2', scenario2LayerMap);
  const gBreads    = buildScenarioGeoJson(data, 'Breads',      breadsLayerMap);

  layerExisting.addLayer(gExisting);
  layerScenario1.addLayer(gScenario1);
  layerScenario2.addLayer(gScenario2);
  layerBreads.addLayer(gBreads);

  // Apply visibility from filterState
  applyLayerVisibility();

  // Initial bounds fit
  if (!filterState.district) {
    const allBounds = [];
    [gExisting, gScenario1, gScenario2, gBreads].forEach(g => {
      try { if (g.getBounds().isValid()) allBounds.push(g.getBounds()); } catch(e) {}
    });
    if (allBounds.length > 0) {
      const combined = allBounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(allBounds[0]));
      map.fitBounds(combined, getSidebarPadding(30));
    }
  }

  // Restore district labels
  if (filterState.district) renderDistrictLabels(filterState.district);
}

// Helper: Apply show/hide to each scenario layer group
function applyLayerVisibility() {
  if (filterState.allClusters) {
    if (!map.hasLayer(baseMandalLayer)) map.addLayer(baseMandalLayer);
  } else {
    if (map.hasLayer(baseMandalLayer))  map.removeLayer(baseMandalLayer);
  }

  if (filterState.existing) {
    if (!map.hasLayer(layerExisting))  map.addLayer(layerExisting);
  } else {
    if (map.hasLayer(layerExisting))   map.removeLayer(layerExisting);
  }
  if (filterState.scenario1) {
    if (!map.hasLayer(layerScenario1)) map.addLayer(layerScenario1);
  } else {
    if (map.hasLayer(layerScenario1))  map.removeLayer(layerScenario1);
  }
  if (filterState.scenario2) {
    if (!map.hasLayer(layerScenario2)) map.addLayer(layerScenario2);
  } else {
    if (map.hasLayer(layerScenario2))  map.removeLayer(layerScenario2);
  }
  if (filterState.breads) {
    if (!map.hasLayer(layerBreads))    map.addLayer(layerBreads);
  } else {
    if (map.hasLayer(layerBreads))     map.removeLayer(layerBreads);
  }

  // Always recompute overlap highlights after any visibility change
  renderOverlapLayer();
}

// ── Canonical Layer Ordering & Overlap Pattern Generator ────────────────────
const CANONICAL_LAYERS = ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'];

const OVERLAP_PATTERN_CONFIGS = {
  'Existing + Scenario 1':   { type: 'triangles', label: 'Triangles Pattern' },
  'Existing + Scenario 2':   { type: 'dots',      label: 'Polka Dots Pattern' },
  'Existing + Breads':       { type: 'boxes',     label: 'Boxes / Squares Pattern' },
  'Scenario 1 + Scenario 2': { type: 'stars',     label: 'Stars Pattern' },
  'Scenario 1 + Breads':     { type: 'diamonds',  label: 'Diamonds Pattern' },
  'Scenario 2 + Breads':     { type: 'stripes',   label: 'Stripes Pattern' }
};

function getPatternTypeForCombo(comboKey) {
  if (OVERLAP_PATTERN_CONFIGS[comboKey]) {
    return OVERLAP_PATTERN_CONFIGS[comboKey].type;
  }
  return 'multi_geo';
}

function getPatternLabelForCombo(comboKey) {
  if (OVERLAP_PATTERN_CONFIGS[comboKey]) {
    return OVERLAP_PATTERN_CONFIGS[comboKey].label;
  }
  return 'Multi-Layer Geo Pattern';
}

// Get canonical unordered combination key (e.g. Existing + Scenario 1 == Scenario 1 + Existing)
function getCanonicalComboKey(layerKeys) {
  if (!layerKeys || layerKeys.length === 0) return '';
  const sorted = CANONICAL_LAYERS.filter(k => layerKeys.includes(k));
  return sorted.join(' + ');
}

function getPatternIdForCombo(layerKeys) {
  const sorted = CANONICAL_LAYERS.filter(k => layerKeys.includes(k));
  if (sorted.length <= 1) return null;
  return 'pat_' + sorted.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, '')).join('_');
}

// Generates dynamic SVG geometric patterns (triangles, dots, boxes, stars, diamonds, stripes, multi-geo) with black outlines
function createPatternElement(patId, comboKey, colors) {
  const patternType = getPatternTypeForCombo(comboKey);
  const c1 = colors[0] || '#0284c7';
  const c2 = colors[1] || '#16a34a';
  const c3 = colors[2] || '#9333ea';
  const c4 = colors[3] || '#eab308';

  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pat.setAttribute('id', patId);
  pat.setAttribute('patternUnits', 'userSpaceOnUse');

  if (patternType === 'triangles') {
    pat.setAttribute('width', '28');
    pat.setAttribute('height', '28');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '28'); bg.setAttribute('height', '28');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    t1.setAttribute('points', '7,2 14,14 0,14');
    t1.setAttribute('fill', c2);
    t1.setAttribute('stroke', '#000000');
    t1.setAttribute('stroke-width', '1.5');
    t1.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(t1);

    const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    t2.setAttribute('points', '21,14 28,26 14,26');
    t2.setAttribute('fill', c2);
    t2.setAttribute('stroke', '#000000');
    t2.setAttribute('stroke-width', '1.5');
    t2.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(t2);

  } else if (patternType === 'dots') {
    pat.setAttribute('width', '24');
    pat.setAttribute('height', '24');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '24'); bg.setAttribute('height', '24');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    d1.setAttribute('cx', '6'); d1.setAttribute('cy', '6'); d1.setAttribute('r', '5');
    d1.setAttribute('fill', c2);
    d1.setAttribute('stroke', '#000000');
    d1.setAttribute('stroke-width', '1.5');
    pat.appendChild(d1);

    const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    d2.setAttribute('cx', '18'); d2.setAttribute('cy', '18'); d2.setAttribute('r', '5');
    d2.setAttribute('fill', c2);
    d2.setAttribute('stroke', '#000000');
    d2.setAttribute('stroke-width', '1.5');
    pat.appendChild(d2);

  } else if (patternType === 'boxes') {
    pat.setAttribute('width', '24');
    pat.setAttribute('height', '24');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '24'); bg.setAttribute('height', '24');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const b1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b1.setAttribute('x', '1'); b1.setAttribute('y', '1');
    b1.setAttribute('width', '11'); b1.setAttribute('height', '11');
    b1.setAttribute('fill', c2);
    b1.setAttribute('stroke', '#000000');
    b1.setAttribute('stroke-width', '1.5');
    pat.appendChild(b1);

    const b2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b2.setAttribute('x', '13'); b2.setAttribute('y', '13');
    b2.setAttribute('width', '11'); b2.setAttribute('height', '11');
    b2.setAttribute('fill', c2);
    b2.setAttribute('stroke', '#000000');
    b2.setAttribute('stroke-width', '1.5');
    pat.appendChild(b2);

  } else if (patternType === 'stars') {
    pat.setAttribute('width', '28');
    pat.setAttribute('height', '28');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '28'); bg.setAttribute('height', '28');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const star1 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    star1.setAttribute('points', '8,1 10,6 15,8 10,10 8,15 6,10 1,8 6,6');
    star1.setAttribute('fill', c2);
    star1.setAttribute('stroke', '#000000');
    star1.setAttribute('stroke-width', '1.5');
    star1.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(star1);

    const star2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    star2.setAttribute('points', '22,15 24,20 29,22 24,24 22,29 20,24 15,22 20,20');
    star2.setAttribute('fill', c2);
    star2.setAttribute('stroke', '#000000');
    star2.setAttribute('stroke-width', '1.5');
    star2.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(star2);

  } else if (patternType === 'diamonds') {
    pat.setAttribute('width', '24');
    pat.setAttribute('height', '24');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '24'); bg.setAttribute('height', '24');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const dia = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    dia.setAttribute('points', '12,2 22,12 12,22 2,12');
    dia.setAttribute('fill', c2);
    dia.setAttribute('stroke', '#000000');
    dia.setAttribute('stroke-width', '1.5');
    dia.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(dia);

  } else if (patternType === 'stripes') {
    pat.setAttribute('width', '20');
    pat.setAttribute('height', '20');
    pat.setAttribute('patternTransform', 'rotate(45 0 0)');

    const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r1.setAttribute('x', '0'); r1.setAttribute('y', '0');
    r1.setAttribute('width', '10'); r1.setAttribute('height', '20');
    r1.setAttribute('fill', c1);
    pat.appendChild(r1);

    const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r2.setAttribute('x', '10'); r2.setAttribute('y', '0');
    r2.setAttribute('width', '10'); r2.setAttribute('height', '20');
    r2.setAttribute('fill', c2);
    pat.appendChild(r2);

    const border1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    border1.setAttribute('x1', '0'); border1.setAttribute('y1', '0');
    border1.setAttribute('x2', '0'); border1.setAttribute('y2', '20');
    border1.setAttribute('stroke', '#000000'); border1.setAttribute('stroke-width', '2');
    pat.appendChild(border1);

    const border2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    border2.setAttribute('x1', '10'); border2.setAttribute('y1', '0');
    border2.setAttribute('x2', '10'); border2.setAttribute('y2', '20');
    border2.setAttribute('stroke', '#000000'); border2.setAttribute('stroke-width', '2');
    pat.appendChild(border2);

  } else {
    // multi_geo (3 or 4 colors)
    pat.setAttribute('width', '32');
    pat.setAttribute('height', '32');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '32'); bg.setAttribute('height', '32');
    bg.setAttribute('fill', c1);
    pat.appendChild(bg);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', '8'); dot.setAttribute('cy', '8'); dot.setAttribute('r', '6');
    dot.setAttribute('fill', c2);
    dot.setAttribute('stroke', '#000000');
    dot.setAttribute('stroke-width', '1.5');
    pat.appendChild(dot);

    const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    tri.setAttribute('points', '24,2 31,14 17,14');
    tri.setAttribute('fill', c3);
    tri.setAttribute('stroke', '#000000');
    tri.setAttribute('stroke-width', '1.5');
    tri.setAttribute('stroke-linejoin', 'round');
    pat.appendChild(tri);

    if (c4) {
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', '16'); box.setAttribute('y', '16');
      box.setAttribute('width', '12'); box.setAttribute('height', '12');
      box.setAttribute('fill', c4);
      box.setAttribute('stroke', '#000000');
      box.setAttribute('stroke-width', '1.5');
      pat.appendChild(box);
    }
  }

  return pat;
}

// Inject pattern SVG definitions into Leaflet SVG defs
function injectSVGPatterns() {
  const svgEl = document.querySelector('#map svg');
  if (!svgEl) return;

  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgEl.insertBefore(defs, svgEl.firstChild);
  }

  const activeKeys = [];
  if (filterState.existing)  activeKeys.push('Existing');
  if (filterState.scenario1) activeKeys.push('Scenario 1');
  if (filterState.scenario2) activeKeys.push('Scenario 2');
  if (filterState.breads)    activeKeys.push('Breads');

  if (!appData || activeKeys.length < 2) return;

  const presentCombos = new Set();
  appData.mandals.features.forEach(f => {
    const fLayers = f.properties.layers || [];
    const matches = activeKeys.filter(k => fLayers.includes(k));
    if (matches.length >= 2) {
      presentCombos.add(getCanonicalComboKey(matches));
    }
  });

  presentCombos.forEach(comboKey => {
    const keys = comboKey.split(' + ');
    const patId = getPatternIdForCombo(keys);
    if (!patId || defs.querySelector('#' + patId)) return;

    const colors = keys.map(k => SCENARIO_STYLES[k] ? SCENARIO_STYLES[k].color : '#2563eb');
    const pat = createPatternElement(patId, comboKey, colors);
    defs.appendChild(pat);
  });
}

// Return the SVG pattern id for a given set of overlapping scenario keys
function getOverlapPatternId(keys) {
  return getPatternIdForCombo(keys);
}

// Render (or refresh) the overlap highlight layer
function renderOverlapLayer() {
  if (!overlapLayerGroup || !appData) return;
  overlapLayerGroup.clearLayers();

  const activeKeys = [];
  if (filterState.existing)  activeKeys.push('Existing');
  if (filterState.scenario1) activeKeys.push('Scenario 1');
  if (filterState.scenario2) activeKeys.push('Scenario 2');
  if (filterState.breads)    activeKeys.push('Breads');
  if (activeKeys.length < 2) return;

  const overlapFeatures = appData.mandals.features.filter(f => {
    const fLayers = f.properties.layers || [];
    return activeKeys.filter(k => fLayers.includes(k)).length >= 2;
  });
  if (overlapFeatures.length === 0) return;

  const overlapGeoJson = L.geoJSON(
    { type: 'FeatureCollection', features: overlapFeatures },
    {
      style: (feature) => {
        const fLayers = feature.properties.layers || [];
        const matches = activeKeys.filter(k => fLayers.includes(k));
        const patId   = getOverlapPatternId(matches);
        return {
          fillColor:   patId ? `url(#${patId})` : '#ef4444',
          fillOpacity: 1.0,
          color:       '#000000',
          weight:      2.5,
          opacity:     1.0
        };
      },
      interactive: false
    }
  );
  overlapLayerGroup.addLayer(overlapGeoJson);

  // Ensure pattern definitions exist inside #map svg
  injectSVGPatterns();
}

// Helper: Render Prominent Mandal Text Label Badges over Centroids for Active District
function renderDistrictLabels(districtName) {
  if (labelLayerGroup) labelLayerGroup.clearLayers();
  if (!districtName) return;

  // Collect unique lgds from all visible scenario maps
  const visibleMaps = [];
  if (filterState.existing)  visibleMaps.push(existingLayerMap);
  if (filterState.scenario1) visibleMaps.push(scenario1LayerMap);
  if (filterState.scenario2) visibleMaps.push(scenario2LayerMap);
  if (filterState.breads)    visibleMaps.push(breadsLayerMap);

  const labelledLgds = new Set();
  visibleMaps.forEach(lMap => {
    lMap.forEach((layer, lgd) => {
      if (labelledLgds.has(lgd)) return;
      const props = mandalDataMap.get(lgd);
      if (!props || props.district !== districtName) return;
      const isActive = props.cluster_count > 0 || props.layers.length > 0;
      if (!isActive) return;

      const lat = props.centroid[1];
      const lng = props.centroid[0];
      const labelMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'mandal-badge-label',
          html: `<div class="mandal-name-badge">${props.mandal}</div>`,
          iconSize: null
        }),
        interactive: false
      });
      labelLayerGroup.addLayer(labelMarker);
      labelledLgds.add(lgd);
    });
  });
}


// 9. Select Mandal Handler
function selectMandal(lgd) {
  selectedLgd = lgd;
  const props = mandalDataMap.get(lgd);
  if (!props) return;

  // Reset all layers
  const allMaps = [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap];
  const styleKeys = ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'];
  allMaps.forEach((lMap, i) => {
    const sKey = styleKeys[i];
    const col  = SCENARIO_STYLES[sKey].color;
    lMap.forEach((l, id) => {
      l.setStyle({ fillColor: col, fillOpacity: 0.72, color: '#000000', weight: 1.2 });
    });
  });

  // Highlight selected in all scenario layers where this lgd appears
  allMaps.forEach(lMap => {
    const l = lMap.get(lgd);
    if (l) {
      l.setStyle({ fillColor: '#f97316', fillOpacity: 0.92, color: '#ffffff', weight: 3.0 });
      l.bringToFront();
    }
  });
  // ← No map.fitBounds — stays at current zoom

  // Update Selection Card in Left Panel
  const card = document.getElementById('selectionCard');
  card.classList.add('visible');

  document.getElementById('selectedMandalName').textContent = props.mandal;
  document.getElementById('selectedDistrictName').textContent = `${props.district} District (LGD: ${lgd})`;
  
  const phaseBadge = document.getElementById('selectedPhaseBadge');
  phaseBadge.textContent = props.phase_category;

  const scenarioBadgesEl = document.getElementById('selectedScenariosBadges');
  const uniqueLayers = getUniqueLayers(props.layers);
  scenarioBadgesEl.innerHTML = uniqueLayers.length > 0
    ? uniqueLayers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
    : '<span class="badge-chip" style="background:#e2e8f0;color:#64748b;">No Scenario Assigned</span>';

  const clusterCountEl = document.getElementById('selectedClusterCount');
  clusterCountEl.textContent = props.cluster_count;

  const clusterListEl = document.getElementById('selectedClusterList');
  clusterListEl.innerHTML = props.clusters.length > 0
    ? props.clusters.map(c => `
        <li style="font-size:11px; padding:6px 8px; background:#f8fafc; border-radius:6px; border-left:3px solid #2563eb; display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; border-left-width:3px;">
          <span style="color:#0f172a;"><i class="fa-solid fa-layer-group" style="color:#2563eb; margin-right:4px;"></i> <b>${c.cluster_name}</b></span>
          <span class="pill" style="background:rgba(37,99,235,0.1);color:#2563eb;">${c.phase}</span>
        </li>
      `).join('')
    : '<li style="font-size:11px; color:#64748b; font-style:italic;">No cluster points located in this mandal</li>';

  // Highlight Item in Sidebar List
  document.querySelectorAll('.mandal-card-item').forEach(item => item.classList.remove('selected'));
  const activeListItem = document.querySelector(`.mandal-card-item[data-lgd="${lgd}"]`);
  if (activeListItem) {
    activeListItem.classList.add('selected');
    activeListItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// 10. Clear Selection
function clearSelection() {
  selectedLgd = null;
  document.getElementById('selectionCard').classList.remove('visible');
  document.querySelectorAll('.mandal-card-item').forEach(item => item.classList.remove('selected'));
  if (appData) renderMapLayers(appData);
}

// 11. Zoom to District & Render Prominent Mandal Text Label Badges on Shapefile Map
function zoomToDistrict(districtName) {
  filterState.district = districtName;

  if (!districtName) {
    if (labelLayerGroup) labelLayerGroup.clearLayers();
    resetMapZoom();
    if (appData) renderMapLayers(appData);
    renderMandalList();
    return;
  }

  // Re-render map layer styling
  if (appData) renderMapLayers(appData);

  // Render labels
  renderDistrictLabels(districtName);

  // Collect layers and fit bounds from all scenario maps
  const matchedLayers = [];
  [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap].forEach(lMap => {
    lMap.forEach((layer, lgd) => {
      const props = mandalDataMap.get(lgd);
      if (props && props.district === districtName) matchedLayers.push(layer);
    });
  });

  if (matchedLayers.length > 0) {
    const group = L.featureGroup(matchedLayers);
    map.fitBounds(group.getBounds(), getSidebarPadding(40));

    // Highlight active district mandals across all scenario layers
    const styleKeys = ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'];
    [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap].forEach((lMap, i) => {
      const col = SCENARIO_STYLES[styleKeys[i]].color;
      lMap.forEach((layer, lgd) => {
        const props = mandalDataMap.get(lgd);
        if (props && props.district === districtName) {
          layer.setStyle({ weight: 2.2, color: '#ffffff', fillColor: col, fillOpacity: 0.9 });
          layer.bringToFront();
        } else {
          layer.setStyle({ fillOpacity: 0.04, opacity: 0.15, weight: 0.3 });
        }
      });
    });
  }

  renderMandalList();
}

// 12. Activate Mandals by Phase (Phase Dropdown Handler)
function activatePhaseMandals(phaseName) {
  filterState.phaseSelect = phaseName;

  if (!phaseName) {
    if (appData) renderMapLayers(appData);
    renderMandalList();
    return;
  }

  const isMultiPhase = phaseName === 'Multi-Phase';
  const matchPhase = (props) => isMultiPhase
    ? props.phase_category.startsWith('Multi')
    : props.phases.includes(phaseName);

  const matchedLayers = [];
  const styleKeys = ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'];
  [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap].forEach((lMap, i) => {
    const col = SCENARIO_STYLES[styleKeys[i]].color;
    lMap.forEach((layer, lgd) => {
      const props = mandalDataMap.get(lgd);
      if (props && matchPhase(props)) {
        matchedLayers.push(layer);
        layer.setStyle({ weight: 2.5, color: '#059669', fillOpacity: 0.88 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillOpacity: 0.04, opacity: 0.15, weight: 0.3 });
      }
    });
  });

  if (matchedLayers.length > 0) {
    const group = L.featureGroup(matchedLayers);
    map.fitBounds(group.getBounds(), getSidebarPadding(40));
  }

  renderMandalList();
}

// 13a. Update Active Layer Pills in sidebar header
function updateActiveLayerPills() {
  const pillsEl = document.getElementById('activeLayerPills');
  if (!pillsEl) return;

  const LAYER_PILL_STYLES = {
    'All Clusters': { bg: '#2563eb', label: 'All Clusters', icon: '🗺️' },
    'Existing':     { bg: '#ec4899', label: 'Existing',     icon: '🌸' },
    'Scenario 1':   { bg: '#16a34a', label: 'Scenario 1',   icon: '🟢' },
    'Scenario 2':   { bg: '#9333ea', label: 'Scenario 2',   icon: '🟣' },
    'Breads':       { bg: '#d97706', label: 'Breads',        icon: '🟡' },
  };

  const activeLayers = [];
  if (filterState.allClusters)  activeLayers.push('All Clusters');
  if (filterState.existing)     activeLayers.push('Existing');
  if (filterState.scenario1)    activeLayers.push('Scenario 1');
  if (filterState.scenario2)    activeLayers.push('Scenario 2');
  if (filterState.breads)       activeLayers.push('Breads');

  if (activeLayers.length === 0) {
    pillsEl.innerHTML = `<span style="font-size:11px; color:#94a3b8; font-style:italic;">None selected</span>`;
    return;
  }

  pillsEl.innerHTML = activeLayers.map(key => {
    const s = LAYER_PILL_STYLES[key];
    return `<span style="
      display:inline-flex; align-items:center; gap:3px;
      background:${s.bg}; color:#fff;
      font-size:10px; font-weight:700;
      padding:2px 8px; border-radius:20px;
      border:1px solid rgba(0,0,0,0.15);
      box-shadow:0 1px 3px rgba(0,0,0,0.12);
    ">${s.icon} ${s.label}</span>`;
  }).join('');
}

// 13. Render Mandals List in Sidebar
function renderMandalList() {
  const container = document.getElementById('mandalList');
  updateActiveLayerPills();
  container.innerHTML = '';

  if (!appData) return;

  const filteredFeatures = appData.mandals.features.filter(f => {
    const p = f.properties;

    // District Filter
    if (filterState.district && p.district !== filterState.district) return false;

    // Phase Select Dropdown Filter
    if (filterState.phaseSelect) {
      const isMultiPhaseFilter = filterState.phaseSelect === 'Multi-Phase';
      const phaseMatch = isMultiPhaseFilter
        ? p.phase_category.startsWith('Multi')
        : p.phases.includes(filterState.phaseSelect);
      if (!phaseMatch) return false;
    }

    // Scenario Checkbox Filter — exclude mandal only if ALL its layers are hidden
    const hasExisting  = p.layers.includes('Existing');
    const hasScenario1 = p.layers.includes('Scenario 1');
    const hasScenario2 = p.layers.includes('Scenario 2');
    const hasBreads    = p.layers.includes('Breads');

    // Build list of which scenario layers THIS mandal belongs to
    const visibleLayers = [
      hasExisting  && filterState.existing,
      hasScenario1 && filterState.scenario1,
      hasScenario2 && filterState.scenario2,
      hasBreads    && filterState.breads,
    ].filter(Boolean);

    // If none of this mandal's scenario layers is visible, hide from list
    const mandalInAnyScenario = hasExisting || hasScenario1 || hasScenario2 || hasBreads;
    if (mandalInAnyScenario && visibleLayers.length === 0) return false;

    // Search Filter
    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      const matchDist = p.district.toLowerCase().includes(q);
      const matchMandal = p.mandal.toLowerCase().includes(q);
      const matchCluster = p.clusters.some(c => c.cluster_name.toLowerCase().includes(q));
      if (!matchDist && !matchMandal && !matchCluster) return false;
    }

    return true;
  });

  document.getElementById('filteredCount').textContent = `${filteredFeatures.length} mandals`;

  if (filteredFeatures.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#64748b; padding:20px; font-size:12px;">No matching mandals found.</div>`;
    return;
  }

  filteredFeatures.forEach(f => {
    const p = f.properties;
    const item = document.createElement('div');
    item.className = `mandal-card-item ${selectedLgd === p.mandal_lgd ? 'selected' : ''}`;
    item.setAttribute('data-lgd', p.mandal_lgd);

    const uniqueLayers = getUniqueLayers(p.layers);
    const mandalColor = getMandalColor(p);
    const scenarioBadges = uniqueLayers.length > 0
      ? uniqueLayers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
      : '<span class="badge-chip" style="background:#e2e8f0;color:#64748b;">Unassigned</span>';

    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:700; color:#0f172a;">${p.mandal}</div>
          <div style="font-size:10px; color:#64748b; margin-top:1px;">${p.district} District</div>
        </div>
        <span class="pill" style="background:${mandalColor}20; color:${mandalColor}; border:1px solid ${mandalColor}55;">${p.phase_category}</span>
      </div>
      <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>${scenarioBadges}</div>
        ${p.cluster_count > 0 ? `<span style="font-size:10px; color:#2563eb; font-weight:600;"><i class="fa-solid fa-layer-group" style="font-size:9px;"></i> ${p.cluster_count} Cluster(s)</span>` : ''}
      </div>
    `;

    item.addEventListener('click', () => {
      selectMandal(p.mandal_lgd);
    });

    item.addEventListener('mouseenter', () => {
      // Highlight in all scenario layers
      const allMaps = [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap];
      allMaps.forEach(lMap => {
        const layer = lMap.get(p.mandal_lgd);
        if (layer) {
          layer.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.92 });
          layer.bringToFront();
        }
      });
    });

    item.addEventListener('mouseleave', () => {
      if (selectedLgd === p.mandal_lgd) return; // keep orange highlight
      const styleKeys = ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'];
      [existingLayerMap, scenario1LayerMap, scenario2LayerMap, breadsLayerMap].forEach((lMap, i) => {
        const layer = lMap.get(p.mandal_lgd);
        if (!layer) return;
        const col = SCENARIO_STYLES[styleKeys[i]].color;
        layer.setStyle({ fillColor: col, fillOpacity: 0.72, color: '#000000', weight: 1.2 });
      });
    });

    container.appendChild(item);
  });

  // Scenario layer visibility is handled by applyLayerVisibility() not per-feature here
  // But we can dim layers not in filtered list per district/phase
}

// 14. Highlight List Item on Map Hover
function highlightListItem(lgd, highlight) {
  const item = document.querySelector(`.mandal-card-item[data-lgd="${lgd}"]`);
  if (item) {
    if (highlight) {
      item.style.borderColor = '#2563eb';
    } else if (selectedLgd !== lgd) {
      item.style.borderColor = '#e2e8f0';
    }
  }
}

function getPatternSvgPreview(comboKey, colors) {
  const patternType = getPatternTypeForCombo(comboKey);
  const c1 = colors[0] || '#0284c7';
  const c2 = colors[1] || '#16a34a';
  const c3 = colors[2] || '#9333ea';
  const c4 = colors[3] || '#dc2626';

  let inner = '';
  if (patternType === 'triangles') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <polygon points="5,2 10,10 0,10" fill="${c2}"/>
      <polygon points="15,10 20,18 10,18" fill="${c2}"/>
    `;
  } else if (patternType === 'dots') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <circle cx="5" cy="5" r="3.5" fill="${c2}"/>
      <circle cx="15" cy="15" r="3.5" fill="${c2}"/>
    `;
  } else if (patternType === 'boxes') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <rect x="0" y="0" width="10" height="10" fill="${c2}"/>
      <rect x="10" y="10" width="10" height="10" fill="${c2}"/>
    `;
  } else if (patternType === 'stars') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <polygon points="6,1 8,5 12,6 8,8 6,12 4,8 0,6 4,5" fill="${c2}"/>
      <polygon points="15,11 17,15 21,16 17,18 15,22 13,18 9,16 13,15" fill="${c2}"/>
    `;
  } else if (patternType === 'diamonds') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <polygon points="10,2 18,10 10,18 2,10" fill="${c2}"/>
    `;
  } else if (patternType === 'stripes') {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <line x1="-5" y1="5" x2="15" y2="-15" stroke="${c2}" stroke-width="5"/>
      <line x1="-5" y1="25" x2="25" y2="-5" stroke="${c2}" stroke-width="5"/>
      <line x1="5" y1="35" x2="35" y2="5" stroke="${c2}" stroke-width="5"/>
    `;
  } else {
    inner = `
      <rect width="20" height="20" fill="${c1}"/>
      <circle cx="5" cy="5" r="3.5" fill="${c2}"/>
      <polygon points="15,2 19,9 11,9" fill="${c3}"/>
    `;
  }

  return `<svg width="22" height="18" viewBox="0 0 20 20" style="border-radius:4px;border:1px solid #000;flex-shrink:0;">${inner}</svg>`;
}

// 15. Update Legend UI based on Classification Mode and Active Overlaps
function updateLegendUI() {
  const title = document.getElementById('legendTitle');
  const content = document.getElementById('legendContent');

  if (classificationMode === 'phase') {
    title.textContent = 'Phase-Wise Mandal Legend';
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#f59e0b;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 1</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#10b981;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 2</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#d946ef;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 3</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#06b6d4;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Multi-Phase</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;flex-shrink:0;"></div><span style="font-size:10px;color:#64748b;font-weight:500;">Unassigned</span></div>
    `;
    return;
  }

  // Active scenario layers
  const activeKeys = [];
  if (filterState.existing)  activeKeys.push('Existing');
  if (filterState.scenario1) activeKeys.push('Scenario 1');
  if (filterState.scenario2) activeKeys.push('Scenario 2');
  if (filterState.breads)    activeKeys.push('Breads');

  title.textContent = 'Map Layers & Overlaps';

  let legendHtml = '';

  // Single Class Layers
  if (activeKeys.length === 0) {
    legendHtml += `
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#2563eb;border:1px solid #000;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">All AP Cluster Mandals</span></div>
    `;
  } else {
    activeKeys.forEach(k => {
      const col = SCENARIO_STYLES[k] ? SCENARIO_STYLES[k].color : '#2563eb';
      legendHtml += `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:12px;height:12px;border-radius:3px;background:${col};border:1px solid #000;flex-shrink:0;"></div>
          <span style="font-size:10px;color:#334155;font-weight:600;">${k}</span>
        </div>
      `;
    });
  }

  // Active Overlap Combinations with SVG pattern previews
  if (appData && activeKeys.length >= 2) {
    const presentCombos = new Set();
    appData.mandals.features.forEach(f => {
      const fLayers = f.properties.layers || [];
      const matches = activeKeys.filter(key => fLayers.includes(key));
      if (matches.length >= 2) {
        presentCombos.add(getCanonicalComboKey(matches));
      }
    });

    if (presentCombos.size > 0) {
      legendHtml += `<div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;margin-top:6px;padding-top:4px;border-top:1px solid #e2e8f0;">Common Overlap Patterns</div>`;
      presentCombos.forEach(comboKey => {
        const keys = comboKey.split(' + ');
        const colors = keys.map(k => SCENARIO_STYLES[k] ? SCENARIO_STYLES[k].color : '#2563eb');
        const patternSvg = getPatternSvgPreview(comboKey, colors);
        const patternLabel = getPatternLabelForCombo(comboKey);

        legendHtml += `
          <div style="display:flex;align-items:center;gap:8px;">
            ${patternSvg}
            <div style="display:flex;flex-direction:column;">
              <span style="font-size:10px;color:#0f172a;font-weight:700;line-height:1.1;">${comboKey}</span>
              <span style="font-size:8.5px;color:#2563eb;font-weight:600;">${patternLabel}</span>
            </div>
          </div>
        `;
      });
    }
  }

  legendHtml += `
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><div style="width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;flex-shrink:0;"></div><span style="font-size:10px;color:#64748b;font-weight:500;">Unassigned</span></div>
  `;

  content.innerHTML = legendHtml;
}

// 16. Render Chart.js Analytics (Enhanced)
function renderAnalyticsCharts() {
  if (!appData) return;

  const phaseCounts    = { 'Phase 1': 0, 'Phase 2': 0, 'Phase 3': 0, 'Multi-Phase': 0 };
  const scenarioCounts = { 'Existing': 0, 'Scenario 1': 0, 'Scenario 2': 0, 'Breads': 0 };
  const districtMap    = {};
  let totalMandals     = 0;
  let totalClusters    = 0;
  let overlapMandals   = 0;

  appData.mandals.features.forEach(f => {
    const p = f.properties;
    totalMandals++;
    totalClusters += (p.cluster_count || 0);

    // Phase counts
    if (p.phase_category in phaseCounts) {
      phaseCounts[p.phase_category]++;
    } else if (p.phase_category && p.phase_category.startsWith('Multi')) {
      phaseCounts['Multi-Phase']++;
    }

    // Layer counts (all 4 layers including Breads)
    (p.layers || []).forEach(l => {
      if (l in scenarioCounts) scenarioCounts[l]++;
    });

    // Overlap count (mandal in 2+ layers)
    if ((p.layers || []).length >= 2) overlapMandals++;

    // District breakdown
    const dist = p.district || 'Unknown';
    if (!districtMap[dist]) districtMap[dist] = { total: 0, clusters: 0 };
    districtMap[dist].total++;
    districtMap[dist].clusters += (p.cluster_count || 0);
  });

  // ── KPI Summary Cards ─────────────────────────────────────────────
  const cardsEl = document.getElementById('analyticsSummaryCards');
  if (cardsEl) {
    const cards = [
      { label: 'Total Mandals',   value: totalMandals,   color: '#2563eb', icon: '📍' },
      { label: 'Total Clusters',  value: totalClusters,  color: '#9333ea', icon: '🏘️' },
      { label: 'Overlap Mandals', value: overlapMandals,  color: '#e11d48', icon: '🔀' },
      { label: 'Districts',       value: Object.keys(districtMap).length, color: '#059669', icon: '🗺️' },
    ];
    cardsEl.innerHTML = cards.map(c => `
      <div style="
        background: linear-gradient(135deg, ${c.color}18, ${c.color}08);
        border: 1px solid ${c.color}33;
        border-radius: 10px;
        padding: 10px;
        text-align: center;
      ">
        <div style="font-size:18px; margin-bottom:2px;">${c.icon}</div>
        <div style="font-size:20px; font-weight:800; color:${c.color}; line-height:1.1;">${c.value}</div>
        <div style="font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">${c.label}</div>
      </div>
    `).join('');
  }

  // ── Scenario Bar Chart (4 layers: Existing, S1, S2, Breads) ───────
  const scenarioCtx = document.getElementById('scenarioChart').getContext('2d');
  if (scenarioChartInstance) scenarioChartInstance.destroy();
  scenarioChartInstance = new Chart(scenarioCtx, {
    type: 'bar',
    data: {
      labels: ['Existing', 'Scenario 1', 'Scenario 2', 'Breads'],
      datasets: [{
        data: [scenarioCounts['Existing'], scenarioCounts['Scenario 1'], scenarioCounts['Scenario 2'], scenarioCounts['Breads']],
        backgroundColor: ['#ec489940', '#16a34a40', '#9333ea40', '#d9770640'],
        borderColor:     ['#ec4899',   '#16a34a',   '#9333ea',   '#d97706'],
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} mandals`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#475569', font: { size: 10, weight: '600' } }, grid: { display: false } },
        y: {
          ticks: { color: '#64748b', font: { size: 10 }, stepSize: 1 },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  });

  // ── Phase Doughnut Chart ───────────────────────────────────────────
  const phaseCtx = document.getElementById('phaseChart').getContext('2d');
  if (phaseChartInstance) phaseChartInstance.destroy();
  phaseChartInstance = new Chart(phaseCtx, {
    type: 'doughnut',
    data: {
      labels: ['Phase 1', 'Phase 2', 'Phase 3', 'Multi-Phase'],
      datasets: [{
        data: [phaseCounts['Phase 1'], phaseCounts['Phase 2'], phaseCounts['Phase 3'], phaseCounts['Multi-Phase']],
        backgroundColor: ['#f59e0b', '#10b981', '#d946ef', '#06b6d4'],
        borderColor: ['#fff', '#fff', '#fff', '#fff'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#334155', font: { size: 10, family: 'Inter', weight: '600' }, padding: 8, boxWidth: 10 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} mandals` }
        }
      }
    }
  });

  // ── District Breakdown Bars ────────────────────────────────────────
  const distListEl = document.getElementById('districtBreakdownList');
  if (distListEl) {
    const sorted = Object.entries(districtMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15);
    const maxTotal = sorted[0] ? sorted[0][1].total : 1;

    distListEl.innerHTML = sorted.map(([dist, data]) => {
      const pct = Math.round((data.total / maxTotal) * 100);
      return `
        <div style="padding: 4px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
            <span style="font-size:10px; font-weight:700; color:#0f172a; max-width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${dist}</span>
            <span style="font-size:10px; color:#64748b; font-weight:600;">${data.total} mandals · ${data.clusters} clusters</span>
          </div>
          <div style="background:#f1f5f9; border-radius:4px; height:5px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background: linear-gradient(90deg, #2563eb, #7c3aed); border-radius:4px; transition:width 0.4s ease;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// 17. Render Audit Modal Log
function renderAuditLog(auditLog) {
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '';

  document.getElementById('auditTotalRows').textContent = auditLog.length;
  const matchedCount = auditLog.filter(a => a.status === 'MATCHED').length;
  document.getElementById('auditMatchedRows').textContent = `${matchedCount} (100%)`;

  auditLog.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${item.sheet}</b></td>
      <td>Row ${item.row}</td>
      <td>${item.district_orig}</td>
      <td>${item.mandal_orig}</td>
      <td><span class="status-tag-matched">MATCHED (${item.match_type})</span></td>
      <td>${item.matched_district || '-'}</td>
      <td>${item.matched_mandal || '-'}</td>
      <td><code>${item.mandal_lgd || '-'}</code></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('auditSearchInput').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#auditTableBody tr').forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// 18. Setup Event Listeners
function setupEventListeners() {
  // Mobile Sidebar Toggle
  const sidebar = document.getElementById('sidebar');
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Desktop Sidebar Collapse Toggle
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
      setTimeout(() => resetMapZoom(), 300);
    });
  }

  // Clear Selection Button
  document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);

  // Search Input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterState.search = e.target.value;
    renderMandalList();
  });

  // District Select Dropdown (Zooms, Activates & Displays Mandal Name Badges)
  document.getElementById('districtSelect').addEventListener('change', (e) => {
    zoomToDistrict(e.target.value);
  });

  // Phase Select Dropdown (Filters & Activates Mandals by Phase)
  document.getElementById('phaseSelect').addEventListener('change', (e) => {
    activatePhaseMandals(e.target.value);
  });

  // Classification Buttons (Phase / Scenario / Unified)
  const btnClassifyPhase = document.getElementById('btnClassifyPhase');
  const btnClassifyScenario = document.getElementById('btnClassifyScenario');
  const btnUnifiedColor = document.getElementById('btnUnifiedColor');
  const statusEl = document.getElementById('classificationStatus');

  function setClassifyActive(mode) {
    classificationMode = mode;
    [btnClassifyPhase, btnClassifyScenario, btnUnifiedColor].forEach(b => b && b.classList.remove('active'));
    if (mode === 'phase') {
      btnClassifyPhase && btnClassifyPhase.classList.add('active');
      statusEl.innerHTML = `Current View: <b style="color:#059669;">Phase-Wise Colors (Phase 1, 2, 3, Multi)</b>`;
    } else if (mode === 'scenario') {
      btnClassifyScenario && btnClassifyScenario.classList.add('active');
      statusEl.innerHTML = `Current View: <b style="color:#9333ea;">Scenario-Wise Colors (Existing, Scenario 1, 2)</b>`;
    } else {
      btnUnifiedColor && btnUnifiedColor.classList.add('active');
      statusEl.innerHTML = `Current View: <b>Single Unified Cluster Color</b>`;
    }
    updateLegendUI();
    if (appData) renderMapLayers(appData);
    renderMandalList();
  }

  btnClassifyPhase && btnClassifyPhase.addEventListener('click', () => {
    if (classificationMode === 'phase') {
      setClassifyActive('unified');
    } else {
      setClassifyActive('phase');
    }
  });

  btnClassifyScenario && btnClassifyScenario.addEventListener('click', () => {
    if (classificationMode === 'scenario') {
      setClassifyActive('unified');
    } else {
      setClassifyActive('scenario');
    }
  });

  btnUnifiedColor && btnUnifiedColor.addEventListener('click', () => setClassifyActive('unified'));

  // Scenario Checkboxes — toggle independent layer groups
  document.getElementById('chkAllClusters').addEventListener('change', (e) => {
    filterState.allClusters = e.target.checked;
    applyLayerVisibility();
    renderMandalList();
  });
  document.getElementById('chkExisting').addEventListener('change', (e) => {
    filterState.existing = e.target.checked;
    applyLayerVisibility();
    renderMandalList();
  });
  document.getElementById('chkScenario1').addEventListener('change', (e) => {
    filterState.scenario1 = e.target.checked;
    applyLayerVisibility();
    renderMandalList();
  });
  document.getElementById('chkScenario2').addEventListener('change', (e) => {
    filterState.scenario2 = e.target.checked;
    applyLayerVisibility();
    renderMandalList();
  });
  document.getElementById('chkBreads').addEventListener('change', (e) => {
    filterState.breads = e.target.checked;
    applyLayerVisibility();
    renderMandalList();
  });

  // Reset Layer Filters Button
  document.getElementById('btnResetLayers').addEventListener('click', () => {
    document.getElementById('districtSelect').value = '';
    document.getElementById('phaseSelect').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('chkAllClusters').checked = true;
    document.getElementById('chkExisting').checked = false;
    document.getElementById('chkScenario1').checked = false;
    document.getElementById('chkScenario2').checked = false;
    document.getElementById('chkBreads').checked = false;

    filterState.district = '';
    filterState.phaseSelect = '';
    filterState.search = '';
    filterState.allClusters = true;
    filterState.existing = false;
    filterState.scenario1 = false;
    filterState.scenario2 = false;
    filterState.breads = false;

    setClassifyActive('unified');

    updateLegendUI();
    resetMapZoom();
    if (appData) renderMapLayers(appData);
    renderMandalList();
  });

  // Tabs Switching
  const tabMandalsBtn = document.getElementById('tabMandalsBtn');
  const tabAnalyticsBtn = document.getElementById('tabAnalyticsBtn');
  const tabMandals = document.getElementById('tabMandals');
  const tabAnalytics = document.getElementById('tabAnalytics');

  tabMandalsBtn.addEventListener('click', () => {
    tabMandalsBtn.classList.add('active');
    tabAnalyticsBtn.classList.remove('active');
    tabMandals.classList.remove('hidden');
    tabAnalytics.classList.add('hidden');
  });

  tabAnalyticsBtn.addEventListener('click', () => {
    tabAnalyticsBtn.classList.add('active');
    tabMandalsBtn.classList.remove('active');
    tabAnalytics.classList.remove('hidden');
    tabMandals.classList.add('hidden');
    renderAnalyticsCharts();
    setTimeout(() => {
      if (phaseChartInstance) phaseChartInstance.resize();
      if (scenarioChartInstance) scenarioChartInstance.resize();
    }, 50);
  });

  // Audit Modal Drawer Toggles
  const auditModal = document.getElementById('auditModal');
  document.getElementById('btnOpenAudit').addEventListener('click', () => {
    auditModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseAudit').addEventListener('click', () => {
    auditModal.classList.add('hidden');
  });
  auditModal.addEventListener('click', (e) => {
    if (e.target === auditModal) auditModal.classList.add('hidden');
  });
}
