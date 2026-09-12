/**
 * AP CLUSTER REARRANGEMENT - INTERACTIVE SPATIAL DASHBOARD & CLUSTER VISUALIZER
 * Unified Cluster Color Default, Phase Classification Action & District Mandal Label Badges
 */

let appData = null;
let map = null;
let activeBasemap = 'satellite';
let basemapLayers = {};

let districtLayerGroup = null;
let mandalLayerGroup = null;
let labelLayerGroup = null;

const mandalLayerMap = new Map(); // mandal_lgd -> L.GeoJSON feature layer
const mandalDataMap = new Map();  // mandal_lgd -> properties object
let selectedLgd = null;

// Classification Mode: 'unified' | 'phase' | 'scenario'
let classificationMode = 'unified';

// Charts
let phaseChartInstance = null;
let scenarioChartInstance = null;

// Filter State
let filterState = {
  search: '',
  district: '',
  phaseSelect: '',
  existing: true,
  scenario1: true,
  scenario2: true
};

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
  mandalLayerGroup = L.layerGroup().addTo(map);
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
  if (mandalLayerGroup && mandalLayerGroup.getLayers().length > 0) {
    const bounds = mandalLayerGroup.getLayers()[0].getBounds();
    map.fitBounds(bounds, getSidebarPadding(30));
  } else {
    map.setView([15.9129, 79.7400], 7);
  }
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

// 7. Dynamic Color Helper (Unified / Phase-wise / Scenario-wise Classification)
function getMandalColor(props) {
  const isAssigned = props.cluster_count > 0 || props.layers.length > 0;
  if (!isAssigned) return 'rgba(255, 255, 255, 0.15)';

  if (classificationMode === 'phase') {
    // Phase-Wise Classified Colors
    const cat = props.phase_category;
    if (cat === 'Phase 1') return '#f59e0b';        // Bright Gold/Amber
    if (cat === 'Phase 2') return '#10b981';        // Bright Emerald Green
    if (cat === 'Phase 3') return '#d946ef';        // Bright Magenta/Purple
    if (cat.startsWith('Multi')) return '#06b6d4'; // Bright Cyan
    return '#94a3b8';
  } else if (classificationMode === 'scenario') {
    // Scenario-Wise Classified Colors
    const sc = props.scenario_category || '';
    const layers = props.layers || [];
    if (layers.length > 1) return '#f59e0b';        // Multi-Scenario: Amber
    if (layers.includes('Existing')) return '#0284c7'; // Existing: Sky Blue
    if (layers.includes('Scenario 1')) return '#16a34a'; // Scenario 1: Green
    if (layers.includes('Scenario 2')) return '#9333ea'; // Scenario 2: Purple
    return '#94a3b8';
  } else {
    // Unified Single Color for all AP Cluster Mandals
    return '#2563eb'; // Royal Blue
  }
}

// 8. Render Vector Layers on Map (Black AP Borders & Mandal Shapefiles)
function renderMapLayers(data) {
  districtLayerGroup.clearLayers();
  mandalLayerGroup.clearLayers();
  mandalLayerMap.clear();
  mandalDataMap.clear();

  // A. District Outline Boundaries (SOLID BLACK BORDER)
  const districtGeoJson = L.geoJSON(data.districts, {
    style: {
      color: '#000000',     // SOLID BLACK BORDER FOR ANDHRA PRADESH
      weight: 2.5,          // Distinct bold outline
      opacity: 1.0,
      fill: false
    },
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(`<b>District: ${feature.properties.district}</b>`, {
        permanent: false,
        direction: 'center'
      });
    }
  });
  districtLayerGroup.addLayer(districtGeoJson);

  // B. Mandal Shapefile Polygons
  const mandalGeoJson = L.geoJSON(data.mandals, {
    style: (feature) => {
      const props = feature.properties;
      const color = getMandalColor(props);
      const isAssigned = props.cluster_count > 0 || props.layers.length > 0;

      // Check if active under district/phase filter
      const isDistrictActive = !filterState.district || props.district === filterState.district;
      const isPhaseActive = !filterState.phaseSelect
        || (filterState.phaseSelect === 'Multi-Phase' ? props.phase_category.startsWith('Multi') : props.phases.includes(filterState.phaseSelect));
      const isActive = isDistrictActive && isPhaseActive;

      return {
        fillColor: color,
        fillOpacity: isActive ? (isAssigned ? 0.72 : 0.08) : 0.05,
        color: '#000000',    // black border for mandal separation
        weight: isActive ? (isAssigned ? 1.0 : 0.4) : 0.3
      };
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const lgd = props.mandal_lgd;
      
      mandalLayerMap.set(lgd, layer);
      mandalDataMap.set(lgd, props);

      // Clean Hover Tooltip
      const scenarioBadges = props.layers.length > 0
        ? props.layers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
        : '<span class="badge-chip" style="background:#e2e8f0;color:#64748b;">No Scenario</span>';

      const phaseBadge = props.phase_category !== 'Unassigned'
        ? `<span class="pill" style="background:rgba(37,99,235,0.12);color:#2563eb;">${props.phase_category}</span>`
        : '<span class="pill" style="background:#e2e8f0;color:#64748b;">Unassigned</span>';

      const tooltipContent = `
        <div style="font-family: var(--font-sans); padding: 4px; color: #0f172a;">
          <div style="font-size: 0.95rem; font-weight: 800; color: #0f172a;">${props.mandal}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${props.district} District (LGD: ${lgd})</div>
          <div style="margin-top: 6px; display:flex; gap:4px; align-items:center;">
            ${phaseBadge}
            ${props.cluster_count > 0 ? `<span style="font-size:0.7rem; color:#2563eb; font-weight:700;"><b>${props.cluster_count}</b> Cluster(s)</span>` : ''}
          </div>
          <div style="margin-top: 6px;">${scenarioBadges}</div>
        </div>
      `;
      layer.bindTooltip(tooltipContent, { sticky: true, opacity: 0.98 });

      // Mouse Events
      layer.on({
        mouseover: (e) => {
          const target = e.target;
          target.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.9 });
          target.bringToFront();
          highlightListItem(lgd, true);
        },
        mouseout: (e) => {
          if (selectedLgd === lgd) {
            // Keep orange highlight on selected mandal (white border)
            e.target.setStyle({ fillColor: '#f97316', fillOpacity: 0.92, color: '#ffffff', weight: 3.0 });
          } else {
            const target = e.target;
            const color = getMandalColor(props);
            const isAssigned = props.cluster_count > 0 || props.layers.length > 0;
            const isDistrictActive = !filterState.district || props.district === filterState.district;
            const isPhaseActive = !filterState.phaseSelect
              || (filterState.phaseSelect === 'Multi-Phase' ? props.phase_category.startsWith('Multi') : props.phases.includes(filterState.phaseSelect));
            const isActive = isDistrictActive && isPhaseActive;

            target.setStyle({
              fillColor: color,
              fillOpacity: isActive ? (isAssigned ? 0.72 : 0.08) : 0.05,
              color: '#000000',   // black border
              weight: isActive ? (isAssigned ? 1.0 : 0.4) : 0.3
            });
          }
          highlightListItem(lgd, false);
        },
        click: (e) => {
          selectMandal(lgd);
        }
      });
    }
  });
  mandalLayerGroup.addLayer(mandalGeoJson);

  // Initial Bounds Fit Centered Relative to Left Panel
  if (!filterState.district && mandalGeoJson.getBounds().isValid()) {
    map.fitBounds(mandalGeoJson.getBounds(), getSidebarPadding(30));
  }

  // Restore district labels if district filter is active
  if (filterState.district) {
    renderDistrictLabels(filterState.district);
  }
}

// Helper: Render Prominent Mandal Text Label Badges over Centroids for Active District
function renderDistrictLabels(districtName) {
  if (labelLayerGroup) {
    labelLayerGroup.clearLayers();
  }
  if (!districtName) return;

  mandalLayerMap.forEach((layer, lgd) => {
    const props = mandalDataMap.get(lgd);
    if (!props) return;
    if (props.district !== districtName) return;

    // Only label ACTIVE mandals (those with clusters or scenario layers assigned)
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
  });
}


// 9. Select Mandal Handler
function selectMandal(lgd) {
  selectedLgd = lgd;
  const layer = mandalLayerMap.get(lgd);
  const props = mandalDataMap.get(lgd);

  if (!layer || !props) return;

  // Reset all mandals: fill their color, white border outline
  mandalLayerMap.forEach((l, id) => {
    const p = mandalDataMap.get(id);
    const color = getMandalColor(p);
    const isAssigned = p.cluster_count > 0 || p.layers.length > 0;
    l.setStyle({
      fillColor: color,
      fillOpacity: isAssigned ? 0.72 : 0.08,
      color: '#000000',          // black border for all mandals
      weight: isAssigned ? 1.0 : 0.4
    });
  });

  // Highlight selected mandal with orange + white border
  layer.setStyle({
    fillColor: '#f97316',        // vivid orange
    fillOpacity: 0.92,
    color: '#ffffff',            // white border on selected
    weight: 3.0
  });
  layer.bringToFront();
  // ← No map.fitBounds — stays at current zoom

  // Update Selection Card in Left Panel
  const card = document.getElementById('selectionCard');
  card.classList.add('visible');

  document.getElementById('selectedMandalName').textContent = props.mandal;
  document.getElementById('selectedDistrictName').textContent = `${props.district} District (LGD: ${lgd})`;
  
  const phaseBadge = document.getElementById('selectedPhaseBadge');
  phaseBadge.textContent = props.phase_category;

  const scenarioBadgesEl = document.getElementById('selectedScenariosBadges');
  scenarioBadgesEl.innerHTML = props.layers.length > 0
    ? props.layers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
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
  
  if (appData) {
    renderMapLayers(appData);
  }
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

  // Collect layers and fit bounds
  const matchedLayers = [];
  mandalLayerMap.forEach((layer, lgd) => {
    const props = mandalDataMap.get(lgd);
    if (props && props.district === districtName) {
      matchedLayers.push(layer);
    }
  });

  if (matchedLayers.length > 0) {
    const group = L.featureGroup(matchedLayers);
    map.fitBounds(group.getBounds(), getSidebarPadding(40));

    // Highlight and activate mandals in selected district
    mandalLayerMap.forEach((layer, lgd) => {
      const props = mandalDataMap.get(lgd);
      if (props.district === districtName) {
        layer.setStyle({ weight: 2.2, color: '#2563eb', fillOpacity: 0.85 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillOpacity: 0.05, opacity: 0.2, weight: 0.4 });
      }
    });
  }

  renderMandalList();
}

// 12. Activate Mandals by Phase (Phase Dropdown Handler)
function activatePhaseMandals(phaseName) {
  filterState.phaseSelect = phaseName;

  if (!phaseName) {
    // All Phases — re-render map fully and reset list
    if (appData) renderMapLayers(appData);
    renderMandalList();
    return;
  }

  const isMultiPhase = phaseName === 'Multi-Phase';
  const matchPhase = (props) => isMultiPhase
    ? props.phase_category.startsWith('Multi')
    : props.phases.includes(phaseName);

  const matchedLayers = [];
  mandalLayerMap.forEach((layer, lgd) => {
    const props = mandalDataMap.get(lgd);
    if (props && matchPhase(props)) {
      matchedLayers.push(layer);
    }
  });

  if (matchedLayers.length > 0) {
    const group = L.featureGroup(matchedLayers);
    map.fitBounds(group.getBounds(), getSidebarPadding(40));

    // Activate & highlight mandals matching the phase
    mandalLayerMap.forEach((layer, lgd) => {
      const props = mandalDataMap.get(lgd);
      if (matchPhase(props)) {
        layer.setStyle({ weight: 2.5, color: '#059669', fillOpacity: 0.85 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillOpacity: 0.05, opacity: 0.2, weight: 0.4 });
      }
    });
  }

  renderMandalList();
}

// 13. Render Mandals List in Sidebar
function renderMandalList() {
  const container = document.getElementById('mandalList');
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

    // Scenario Checkbox Filter
    const hasExisting = p.layers.includes('Existing');
    const hasScenario1 = p.layers.includes('Scenario 1');
    const hasScenario2 = p.layers.includes('Scenario 2');

    if (!filterState.existing && hasExisting && p.layers.length === 1) return false;
    if (!filterState.scenario1 && hasScenario1 && p.layers.length === 1) return false;
    if (!filterState.scenario2 && hasScenario2 && p.layers.length === 1) return false;

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

    const mandalColor = getMandalColor(p);
    const scenarioBadges = p.layers.length > 0
      ? p.layers.map(l => `<span class="badge-chip badge-${l.toLowerCase().replace(' ', '')}">${l}</span>`).join(' ')
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
      const layer = mandalLayerMap.get(p.mandal_lgd);
      if (layer) {
        layer.setStyle({ weight: 3.5, color: '#ffffff', fillOpacity: 0.9 });
        layer.bringToFront();
      }
    });

    item.addEventListener('mouseleave', () => {
      const layer = mandalLayerMap.get(p.mandal_lgd);
      if (!layer) return;
      if (selectedLgd === p.mandal_lgd) {
        // Restore orange highlight + white border for selected mandal
        layer.setStyle({ fillColor: '#f97316', fillOpacity: 0.92, color: '#ffffff', weight: 3.0 });
      } else {
        const color = getMandalColor(p);
        const isAssigned = p.cluster_count > 0 || p.layers.length > 0;
        layer.setStyle({
          fillColor: color,
          fillOpacity: isAssigned ? 0.72 : 0.08,
          color: '#000000',   // black border
          weight: isAssigned ? 1.0 : 0.4
        });
      }
    });

    container.appendChild(item);
  });

  // Filter Map Features Visibility
  mandalLayerMap.forEach((layer, lgd) => {
    const isVisible = filteredFeatures.some(f => f.properties.mandal_lgd === lgd);
    if (isVisible) {
      if (!mandalLayerGroup.hasLayer(layer)) mandalLayerGroup.addLayer(layer);
    } else {
      if (mandalLayerGroup.hasLayer(layer)) mandalLayerGroup.removeLayer(layer);
    }
  });
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

// 15. Update Legend UI based on Classification Mode
function updateLegendUI() {
  const title = document.getElementById('legendTitle');
  const content = document.getElementById('legendContent');

  if (classificationMode === 'phase') {
    title.textContent = 'Phase-Wise Mandal Legend';
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#f59e0b;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 1</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#10b981;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 2</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#d946ef;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Phase 3</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#06b6d4;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Multi-Phase</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;flex-shrink:0;"></div><span style="font-size:10px;color:#64748b;font-weight:500;">Unassigned</span></div>
    `;
  } else if (classificationMode === 'scenario') {
    title.textContent = 'Scenario-Wise Mandal Legend';
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#0284c7;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Existing</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#16a34a;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Scenario 1</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#9333ea;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Scenario 2</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#f59e0b;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">Multi-Scenario</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;flex-shrink:0;"></div><span style="font-size:10px;color:#64748b;font-weight:500;">Unassigned</span></div>
    `;
  } else {
    title.textContent = 'AP Cluster Mandals';
    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;background:#2563eb;flex-shrink:0;"></div><span style="font-size:10px;color:#334155;font-weight:600;">AP Cluster Mandals (Unified)</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;flex-shrink:0;"></div><span style="font-size:10px;color:#64748b;font-weight:500;">Unassigned</span></div>
    `;
  }
}

// 16. Render Chart.js Analytics
function renderAnalyticsCharts() {
  if (!appData) return;

  const phaseCounts = { 'Phase 1': 0, 'Phase 2': 0, 'Phase 3': 0, 'Multi-Phase': 0 };
  const scenarioCounts = { 'Existing': 0, 'Scenario 1': 0, 'Scenario 2': 0 };

  appData.mandals.features.forEach(f => {
    const p = f.properties;
    if (p.phase_category in phaseCounts) {
      phaseCounts[p.phase_category]++;
    } else if (p.phase_category.startsWith('Multi')) {
      phaseCounts['Multi-Phase']++;
    }

    p.layers.forEach(l => {
      if (l in scenarioCounts) scenarioCounts[l]++;
    });
  });

  // Scenario Chart
  const scenarioCtx = document.getElementById('scenarioChart').getContext('2d');
  if (scenarioChartInstance) scenarioChartInstance.destroy();
  scenarioChartInstance = new Chart(scenarioCtx, {
    type: 'bar',
    data: {
      labels: Object.keys(scenarioCounts),
      datasets: [{
        data: Object.values(scenarioCounts),
        backgroundColor: ['#0284c7', '#16a34a', '#9333ea'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' } }
      }
    }
  });

  // Phase Chart
  const phaseCtx = document.getElementById('phaseChart').getContext('2d');
  if (phaseChartInstance) phaseChartInstance.destroy();
  phaseChartInstance = new Chart(phaseCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(phaseCounts),
      datasets: [{
        data: Object.values(phaseCounts),
        backgroundColor: ['#f59e0b', '#10b981', '#d946ef', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#334155', font: { size: 10, family: 'Inter' } } }
      }
    }
  });
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

  btnClassifyPhase && btnClassifyPhase.addEventListener('click', () => setClassifyActive('phase'));
  btnClassifyScenario && btnClassifyScenario.addEventListener('click', () => setClassifyActive('scenario'));
  btnUnifiedColor && btnUnifiedColor.addEventListener('click', () => setClassifyActive('unified'));

  // Scenario Checkboxes
  document.getElementById('chkExisting').addEventListener('change', (e) => {
    filterState.existing = e.target.checked;
    renderMandalList();
  });
  document.getElementById('chkScenario1').addEventListener('change', (e) => {
    filterState.scenario1 = e.target.checked;
    renderMandalList();
  });
  document.getElementById('chkScenario2').addEventListener('change', (e) => {
    filterState.scenario2 = e.target.checked;
    renderMandalList();
  });

  // Reset Layer Filters Button
  document.getElementById('btnResetLayers').addEventListener('click', () => {
    document.getElementById('districtSelect').value = '';
    document.getElementById('phaseSelect').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('chkExisting').checked = true;
    document.getElementById('chkScenario1').checked = true;
    document.getElementById('chkScenario2').checked = true;

    filterState.district = '';
    filterState.phaseSelect = '';
    filterState.search = '';
    filterState.existing = true;
    filterState.scenario1 = true;
    filterState.scenario2 = true;

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
    if (phaseChartInstance) phaseChartInstance.resize();
    if (scenarioChartInstance) scenarioChartInstance.resize();
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
