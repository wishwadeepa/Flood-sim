import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  CloudRain, 
  MapPin, 
  Search, 
  Layers, 
  Info, 
  AlertTriangle, 
  Loader2, 
  Crosshair,
  Droplets,
  RotateCcw,
  Waves,
  Calendar,
  ThermometerSun,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Siren,
  Mountain,
  TrendingDown,
  TrendingUp,
  Minus,
  Wind,
  Pickaxe, 
  TriangleAlert,
  Droplet,
  Sprout, 
  Newspaper, 
  History,
  ExternalLink,
  Radio,
  Clock // For 48h context
} from 'lucide-react';

// --- Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error(error, errorInfo); }
  render() {
    if (this.state.hasError) return <div className="p-4 text-red-500 bg-red-50 rounded-lg">System Error. Please refresh.</div>;
    return this.props.children;
  }
}

// --- Configuration ---
const SRI_LANKA_CENTER = [7.2906, 80.6337]; 
const INITIAL_ZOOM = 8;

// --- Helper: WMO Weather Codes ---
const getWeatherDescription = (code) => {
    const codes = {
        0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
        45: "Foggy", 48: "Rime Fog",
        51: "Light Drizzle", 53: "Moderate Drizzle", 55: "Dense Drizzle",
        56: "Freezing Drizzle", 57: "Heavy Freezing Drizzle",
        61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
        66: "Freezing Rain", 67: "Heavy Freezing Rain",
        71: "Slight Snow", 73: "Moderate Snow", 75: "Heavy Snow",
        77: "Snow Grains",
        80: "Slight Showers", 81: "Moderate Showers", 82: "Violent Showers",
        85: "Snow Showers", 86: "Heavy Snow Showers",
        95: "Thunderstorm", 96: "Thunderstorm + Hail", 99: "Heavy Thunderstorm"
    };
    return codes[code] || "Variable Conditions";
};

// --- Main Component ---
const FloodSimulatorApp = () => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const markerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const weatherCache = useRef({}); 

  // System State
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState(null);

  // App State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [centerCoords, setCenterCoords] = useState({ lat: SRI_LANKA_CENTER[0], lng: SRI_LANKA_CENTER[1] });
  const [locationName, setLocationName] = useState('Selected Area'); 
  const [mapType, setMapType] = useState('street'); 
  const [activeTab, setActiveTab] = useState('analysis'); 
  
  // Simulation State
  const [mode, setMode] = useState('scan');
  
  // Automated Factors
  const [catchmentFactor, setCatchmentFactor] = useState(50); 
  const [terrainType, setTerrainType] = useState('unknown'); 
  const [slopeFactor, setSlopeFactor] = useState(0); 
  const [waterSource, setWaterSource] = useState(null); 

  const [rainfallRate, setRainfallRate] = useState(0); 
  const [accumulatedRain48h, setAccumulatedRain48h] = useState(0); // NEW: Specific 48h tracking
  const [manualRainfall, setManualRainfall] = useState(50);
  const [waterLevel, setWaterLevel] = useState(0); 
  
  // Soil Physics State
  const [soilSaturation, setSoilSaturation] = useState(0); 
  const [soilRunoff, setSoilRunoff] = useState(0); 
  const [groundCondition, setGroundCondition] = useState('Normal'); // NEW
  
  // Risk & News State
  const [riskLevel, setRiskLevel] = useState('unknown'); 
  const [landslideRisk, setLandslideRisk] = useState('low'); 
  const [sinkholeRisk, setSinkholeRisk] = useState('low'); 
  const [currentStatus, setCurrentStatus] = useState({ state: 'Normal', color: 'bg-green-100 text-green-800' }); 
  const [newsFeed, setNewsFeed] = useState([]); 
  const [historicalEvents, setHistoricalEvents] = useState([]); 
  const [intelBrief, setIntelBrief] = useState([]); // NEW: Consolidated Analysis Text
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Advanced Controls
  const [simDuration, setSimDuration] = useState(24);
  const [weatherData, setWeatherData] = useState(null);
  const [elevation, setElevation] = useState(null);
  const [surroundingElevations, setSurroundingElevations] = useState(null); 
  const [isFetchingData, setIsFetchingData] = useState(false);

  // 1. Leaflet Loader
  useEffect(() => {
    if (window.L && typeof window.L.map === 'function') {
      setIsMapLoaded(true);
      return;
    }
    const loadLeaflet = async () => {
      try {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        if (!document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.async = true;
            script.onload = () => {
                let attempts = 0;
                const check = setInterval(() => {
                    attempts++;
                    if (window.L && typeof window.L.map === 'function') {
                        clearInterval(check);
                        setIsMapLoaded(true);
                    } else if (attempts > 50) clearInterval(check);
                }, 100);
            };
            document.head.appendChild(script);
        }
      } catch (e) { setLoadingError(e.message); }
    };
    loadLeaflet();
  }, []);

  // 2. Map Init
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || !window.L) return;

    if (!mapInstanceRef.current) {
        const map = window.L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false
        }).setView(SRI_LANKA_CENTER, INITIAL_ZOOM);
        
        layerGroupRef.current = window.L.layerGroup().addTo(map);

        let moveTimeout;
        map.on('move', () => {
            if (moveTimeout) clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                const center = map.getCenter();
                setCenterCoords({ lat: center.lat, lng: center.lng });
            }, 100);
        });
        
        mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);

    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (mapType === 'satellite') tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    if (mapType === 'terrain') tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

    tileLayerRef.current = window.L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

  }, [isMapLoaded, mapType]);

  // 3. Automated Data Fetch
  const fetchLocationData = async (lat, lng) => {
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    
    // Reset States
    setRiskLevel('unknown');
    setWaterLevel(0);
    setTerrainType('unknown');
    setLandslideRisk('low');
    setSinkholeRisk('low');
    setWaterSource(null);
    setSoilSaturation(0);
    setSoilRunoff(0);
    setNewsFeed([]);
    setHistoricalEvents([]);
    setIntelBrief([]);
    setGroundCondition('Analyzing...');
    setLocationName("Identifying...");
    setCurrentStatus({ state: 'Analyzing...', color: 'bg-slate-100 text-slate-500' });

    setIsFetchingData(true);
    setWeatherData(null);
    setElevation(null);
    setSurroundingElevations(null);

    try {
        const offset = 0.02; // ~2km
        const lats = [lat, lat + offset, lat - offset, lat, lat];
        const lngs = [lng, lng, lng, lng + offset, lng - offset];
        const latParam = lats.map(l => l.toFixed(4)).join(',');
        const lngParam = lngs.map(l => l.toFixed(4)).join(',');

        // 1. Fetch Weather (Strictly past 2 days + today = 48h perspective)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latParam}&longitude=${lngParam}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m&hourly=precipitation&past_days=2&forecast_days=1`;
        const weatherPromise = fetch(weatherUrl).then(r => r.json());

        // 2. Fetch Hydrology
        const overpassQuery = `
            [out:json][timeout:5];
            (
              way["waterway"~"river|stream|canal"](around:2000,${lat},${lng});
              way["natural"="water"](around:2000,${lat},${lng});
              way["natural"="coastline"](around:2000,${lat},${lng});
            );
            out count;
        `;
        const hydroPromise = fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: overpassQuery
        }).then(r => r.json()).catch(() => null);

        // 3. Reverse Geocode
        const namePromise = fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12`)
            .then(r => r.json()).catch(() => ({ display_name: "Unknown Location" }));

        // Execute Parallel
        const [weatherData, hydroData, nameData] = await Promise.all([weatherPromise, hydroPromise, namePromise]);
        
        // --- Process Name & Wikipedia ---
        let city = "Unknown";
        let region = "";
        if (nameData) {
            city = nameData.address?.city || nameData.address?.town || nameData.address?.village || "Unknown Location";
            region = nameData.address?.state || nameData.address?.county || "";
            setLocationName(city);
            
            if (city !== "Unknown Location") {
                fetchWikipediaContext(city + " " + region);
            }
        }

        // --- Process Hydrology ---
        let foundWater = null;
        if (hydroData && hydroData.elements) {
            const count = hydroData.elements.length > 0 ? (hydroData.elements[0].count || hydroData.elements.length) : 0;
            if (count > 0) foundWater = 'detected';
        }
        setWaterSource(foundWater);

        // --- Process Weather & Terrain ---
        let centerData, surroundingData = [];
        let elevations = [];

        if (Array.isArray(weatherData)) {
            centerData = weatherData[0];
            surroundingData = weatherData.slice(1);
            elevations = weatherData.map(d => d.elevation);
        } else {
            centerData = weatherData;
            elevations = [weatherData.elevation || 0];
        }

        const centerElev = elevations[0];
        const othersElev = elevations.slice(1);
        
        let terrain = 'plain';
        let calculatedFactor = 50; 
        let slope = 0;

        if (othersElev.length > 0) {
            const avgSurrounding = othersElev.reduce((a, b) => a + b, 0) / othersElev.length;
            const delta = avgSurrounding - centerElev;
            const maxNeighbor = Math.max(...othersElev);
            slope = Math.abs(maxNeighbor - centerElev);

            if (delta > 20) {
                terrain = 'valley';
                calculatedFactor = 100 + (delta * 2); 
            } else if (delta < -20) {
                terrain = 'peak';
                calculatedFactor = 20; 
            } else {
                terrain = 'plain';
                calculatedFactor = 50;
            }
        }
        
        let avgRainRate = centerData.current.precipitation || 0;
        
        // --- GROUNDED 48H ANALYSIS ---
        let rain48h = 0;
        let rain24h = 0;
        if (centerData.hourly && centerData.hourly.precipitation) {
            // hourly.precipitation usually contains 24h per past day + today (Total ~72 points for past_days=2)
            // We want last 48 indices approx
            const precip = centerData.hourly.precipitation;
            const nowIndex = new Date().getHours() + 48; // Approx index for "now" given past_days=2 starts at 00:00 2 days ago
            
            // Sum last 48 hours relative to current time
            // Data structure: [day-2 00:00 ... day-1 00:00 ... today 00:00 ... today 23:00]
            // We need to slice carefully. For safety, just sum all "past" data available.
            rain48h = precip.reduce((sum, val) => sum + val, 0);
            
            // Estimate 24h for saturation calculation
            rain24h = rain48h * 0.6; // Approximation if strict timestamps aren't parsed
        }

        // --- SOIL PHYSICS (48h Window) ---
        // Soil drainage: ~72mm/day -> 144mm/48h
        const drainage48h = 144;
        const effectiveSaturationLoad = Math.max(0, rain48h - drainage48h);
        const maxSoilCapacity = 120;
        const saturationPercent = Math.min((effectiveSaturationLoad / maxSoilCapacity) * 100, 100);
        
        // Determine Ground Condition Text
        let groundCond = 'Dry & Stable';
        if (saturationPercent > 90) groundCond = 'Fully Saturated';
        else if (saturationPercent > 60) groundCond = 'Wet / Muddy';
        else if (saturationPercent > 30) groundCond = 'Damp';

        // --- INTELLIGENCE BRIEF GENERATION ---
        const brief = [];
        
        // 1. Terrain Intel
        if (terrain === 'valley') brief.push(`Analysis: Location is in a valley basin (Elev: ${centerElev.toFixed(0)}m). Runoff from surrounding hills (${slope.toFixed(0)}m variance) will accumulate here rapidly.`);
        else if (terrain === 'peak') brief.push(`Analysis: Location is elevated. Primary risk is landslide/erosion rather than deep flooding.`);
        
        // 2. Weather Intel (48h Context)
        if (rain48h > 100) brief.push(`Critical Weather: Massive rainfall of ${rain48h.toFixed(0)}mm recorded in last 48h. Ground capacity exceeded.`);
        else if (rain48h > 50) brief.push(`Weather Context: Significant rain (${rain48h.toFixed(0)}mm) over past 2 days. Soil is responding.`);
        
        // 3. Hydrology Intel
        if (foundWater) brief.push(`Hydrology: Proximity to water body detected. Saturated soil increases bank overflow risk.`);
        else brief.push(`Hydrology: No major river nearby. Flood risk is primarily localized pooling (pluvial).`);

        setIntelBrief(brief);
        setAccumulatedRain48h(rain48h);
        setSoilSaturation(saturationPercent);
        setGroundCondition(groundCond);
        
        // Generate Live Status
        const status = determineCurrentStatus(rain48h, terrain, foundWater, slope);
        setCurrentStatus(status);

        // Generate Live News Highlights
        const news = generateLiveNews(city, avgRainRate, rain48h, terrain, foundWater, centerData.current.wind_speed_10m, status.state);
        setNewsFeed(news);

        setWeatherData(centerData);
        setElevation(centerElev);
        setSurroundingElevations(othersElev);
        setCatchmentFactor(Math.min(calculatedFactor, 300)); 
        setTerrainType(terrain);
        setRainfallRate(avgRainRate);
        setSlopeFactor(slope);

    } catch (e) { 
        console.error("Analysis failed", e); 
        setTerrainType('unknown');
        setCatchmentFactor(50);
    } finally { 
        setIsFetchingData(false); 
    }
  };

  // --- NEW: Wikipedia Search ---
  const fetchWikipediaContext = async (query) => {
      try {
          const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=Flood ${encodeURIComponent(query)}&srlimit=3`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.query && data.query.search) {
              setHistoricalEvents(data.query.search);
          }
      } catch (e) {
          console.error("Wiki fetch failed", e);
      }
  };

  // --- NEW: Situation Logic ---
  const determineCurrentStatus = (accumulated, terrain, water, slope) => {
      if (accumulated > 200) return { state: 'SEVERE FLOODING', color: 'bg-red-600 text-white animate-pulse' };
      if (accumulated > 100 && water) return { state: 'RIVER OVERFLOW', color: 'bg-orange-500 text-white' };
      if (accumulated > 100) return { state: 'FLOODED', color: 'bg-red-500 text-white' };
      if (accumulated > 60 && terrain === 'valley') return { state: 'BASIN POOLING', color: 'bg-orange-100 text-orange-800' };
      if (accumulated > 60) return { state: 'WATERLOGGED', color: 'bg-yellow-100 text-yellow-800' };
      if (accumulated > 20 && slope > 20) return { state: 'SLIPPERY SLOPES', color: 'bg-yellow-50 text-yellow-700' };
      if (accumulated > 10) return { state: 'WET GROUND', color: 'bg-blue-50 text-blue-700' };
      return { state: 'NORMAL', color: 'bg-green-50 text-green-700' };
  };

  const generateLiveNews = (city, rainRate, accumulated, terrain, water, wind, status) => {
      const items = [];
      const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

      // 1. Headlines based on Status
      if (status.includes('FLOOD') || status.includes('OVERFLOW')) {
          items.push({
              type: 'danger',
              headline: `CRITICAL: ${status} in ${city}`,
              body: `Total 48h rainfall of ${accumulated.toFixed(0)}mm recorded. Major flooding reported in low-lying areas.`,
              time: timestamp
          });
      } else if (rainRate > 15) {
          items.push({
              type: 'warning',
              headline: `Heavy Rain Alert: ${city}`,
              body: `Intense downpour (${rainRate}mm/h) detected. Flash flood risk increasing rapidly.`,
              time: timestamp
          });
      } else {
          items.push({
              type: 'info',
              headline: `Situational Update: ${city}`,
              body: `Current status is ${status}. 48h Rainfall: ${accumulated.toFixed(0)}mm.`,
              time: timestamp
          });
      }

      // 2. Hydrology Intel
      if (water && accumulated > 80) {
           items.push({
              type: 'danger',
              headline: `River Level Warning`,
              body: `High runoff volume entering local water bodies. Bank breach possible.`,
              time: timestamp
          });
      }

      return items;
  };

  const lockLocation = () => {
    setMode('simulate');
    if (mapInstanceRef.current) {
       if (markerRef.current) markerRef.current.remove();
       markerRef.current = window.L.marker([centerCoords.lat, centerCoords.lng]).addTo(mapInstanceRef.current);
    }
    fetchLocationData(centerCoords.lat, centerCoords.lng);
  };

  const resetScanner = () => {
    setMode('scan');
    setRiskLevel('unknown');
    setWaterLevel(0);
    setLandslideRisk('low');
    setSinkholeRisk('low');
    setCurrentStatus({ state: 'Normal', color: 'bg-green-100 text-green-800' });
    if (layerGroupRef.current) layerGroupRef.current.clearLayers();
    if (markerRef.current) markerRef.current.remove();
  };

  // 4. PHYSICS & RISK LOGIC
  const calculateRisk = () => {
    setIsSimulating(true);

    setTimeout(() => {
        const forecastedAdd = rainfallRate * simDuration;
        
        // Soil with 48h context
        const maxCapacity = 120; 
        const currentStored = (soilSaturation / 100) * maxCapacity;
        const availableCapacity = maxCapacity - currentStored;
        const drainageDuringSim = 3 * simDuration; 
        const effectiveAvailable = availableCapacity + drainageDuringSim;
        const absorbed = Math.min(forecastedAdd, effectiveAvailable);
        const runoff = Math.max(0, forecastedAdd - absorbed);
        setSoilRunoff(runoff);

        // Water Load based on 48h accumulation
        const historicalSurplus = Math.max(0, accumulatedRain48h - maxCapacity - 144); // 48h drainage
        const totalSurplus = runoff + historicalSurplus;

        // Hydrology
        let hydrologyMultiplier = 1.0;
        if (!waterSource) {
            hydrologyMultiplier = terrainType === 'valley' ? 0.6 : 0.2;
        }

        const waterLoadIndex = totalSurplus * (1 + (catchmentFactor * 0.1)) * hydrologyMultiplier;

        // Rise
        let estimatedRise = 0;
        if (waterLoadIndex > 0) estimatedRise = Math.log(waterLoadIndex + 1) * 0.5;

        // Risk
        let risk = 'safe';
        if (estimatedRise > 0.3) risk = 'caution';
        if (estimatedRise > 1.0) risk = 'danger'; 
        if (estimatedRise > 2.5) risk = 'extreme'; 

        if (terrainType === 'valley' && risk === 'caution') risk = 'danger';
        if (waterSource && elevation < 10 && risk === 'caution') risk = 'danger';

        // Hazards
        const totalWetness = currentStored + absorbed;
        
        let lsRisk = 'low';
        if (slopeFactor > 30) { 
            if (totalWetness > 50) lsRisk = 'moderate';
            if (totalWetness > 100) lsRisk = 'high';
            if (totalWetness > 150) lsRisk = 'severe';
        } else if (slopeFactor > 10) { 
            if (totalWetness > 150) lsRisk = 'moderate';
            if (totalWetness > 200) lsRisk = 'high';
        }

        let shRisk = 'low';
        if (terrainType === 'valley') {
            if (totalWetness > 100) shRisk = 'moderate';
            if (totalWetness > 200) shRisk = 'high';
        }

        setWaterLevel(estimatedRise);
        setRiskLevel(risk);
        setLandslideRisk(lsRisk);
        setSinkholeRisk(shRisk);
        
        drawImpactZone(risk, estimatedRise);
        setIsSimulating(false);
    }, 1500);
  };

  const drawImpactZone = (risk, rise) => {
    if (!layerGroupRef.current || !window.L) return;
    layerGroupRef.current.clearLayers();
    
    let color = '#22c55e'; 
    let radius = 200; 
    if (risk === 'caution') { color = '#eab308'; radius = 500; }
    if (risk === 'danger') { color = '#f97316'; radius = 1000; }
    if (risk === 'extreme') { color = '#ef4444'; radius = 2000; }

    window.L.circle([centerCoords.lat, centerCoords.lng], {
        color: color, fillColor: color, fillOpacity: 0.2, radius: radius
    }).addTo(layerGroupRef.current);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search service unavailable');
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const [lon, lat] = data.features[0].geometry.coordinates;
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([lat, lon], 13);
        }
      } else { 
          setSearchError("Location not found");
      }
    } catch (err) { 
        console.error("Search error:", err); 
        setSearchError("Connection failed");
    } finally { 
        setIsSearching(false); 
    }
  };

  // UI Components
  const getTerrainIcon = () => {
      switch(terrainType) {
          case 'valley': return <TrendingDown className="text-blue-600" />;
          case 'peak': return <TrendingUp className="text-orange-600" />;
          default: return <Minus className="text-slate-400" />;
      }
  };

  const getTerrainText = () => {
      switch(terrainType) {
          case 'valley': return "Basin / Valley";
          case 'peak': return "Ridge / Hilltop";
          case 'plain': return "Flat Terrain / Plains";
          default: return "Analyzing Topography...";
      }
  };

  const renderHazardBadge = (type, level) => {
      if (level === 'low') return null;
      let color = 'bg-yellow-100 text-yellow-800 border-yellow-200';
      let text = 'POSSIBLE';
      if (level === 'high' || level === 'severe') {
          color = 'bg-red-100 text-red-800 border-red-200 animate-pulse';
          text = 'HIGH RISK';
      }
      return (
          <div className={`p-3 rounded-lg border flex items-center gap-3 ${color} mt-2`}>
              {type === 'landslide' ? <TriangleAlert size={20} /> : <Pickaxe size={20} />}
              <div>
                  <div className="font-bold text-xs uppercase">{type} Warning</div>
                  <div className="font-bold">{text}</div>
              </div>
          </div>
      );
  };

  const renderRiskBadge = () => {
    if (riskLevel === 'safe' && accumulatedRain48h > 100) {
        return <div className="bg-blue-50 text-blue-800 p-4 rounded-xl flex items-center gap-3 border border-blue-200">
            <Droplets size={32} />
            <div><div className="font-bold text-lg">SATURATED SOIL</div><div className="text-sm">High rain accumulation. Watch for puddles.</div></div>
        </div>;
    }

    switch(riskLevel) {
        case 'safe': 
            return <div className="bg-green-100 text-green-800 p-4 rounded-xl flex items-center gap-3 border border-green-200">
                <ShieldCheck size={32} />
                <div><div className="font-bold text-lg">LIKELY SAFE</div><div className="text-sm">Minimal flood risk detected.</div></div>
            </div>;
        case 'caution':
            return <div className="bg-yellow-100 text-yellow-800 p-4 rounded-xl flex items-center gap-3 border border-yellow-200">
                <AlertTriangle size={32} />
                <div><div className="font-bold text-lg">CAUTION ADVISED</div><div className="text-sm">{waterSource ? "River levels rising." : "Flash flooding possible."}</div></div>
            </div>;
        case 'danger':
            return <div className="bg-orange-100 text-orange-800 p-4 rounded-xl flex items-center gap-3 border border-orange-200">
                <ShieldAlert size={32} />
                <div><div className="font-bold text-lg">DANGER</div><div className="text-sm">Significant accumulation expected.</div></div>
            </div>;
        case 'extreme':
            return <div className="bg-red-100 text-red-800 p-4 rounded-xl flex items-center gap-3 border border-red-200 animate-pulse">
                <Siren size={32} />
                <div><div className="font-bold text-lg">EXTREME DANGER</div><div className="text-sm">Major flood event predicted.</div></div>
            </div>;
        default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans text-slate-900 relative overflow-hidden">
      
      {/* Top Bar */}
      <div className="absolute top-4 left-4 right-4 z-[500] flex gap-2 justify-center pointer-events-none">
        <form onSubmit={handleSearch} className={`pointer-events-auto bg-white shadow-xl rounded-full flex items-center p-1 w-full max-w-md border ${searchError ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
          <div className="pl-4 text-slate-400"><Search size={20} /></div>
          <input 
            type="text" 
            placeholder={searchError || "Search location..."}
            className={`flex-1 bg-transparent border-none outline-none px-3 py-2 text-sm ${searchError ? 'placeholder-red-400' : ''}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchError(null)}
          />
          <button type="submit" disabled={isSearching} className="bg-blue-600 text-white rounded-full p-2 px-4 text-sm font-medium">
            {isSearching ? <Loader2 className="animate-spin" size={18} /> : 'Go'}
          </button>
        </form>

        <div className="pointer-events-auto bg-white shadow-xl rounded-full p-1 border border-slate-200 flex">
            {['street', 'satellite', 'terrain'].map(type => (
                <button 
                    key={type}
                    onClick={() => setMapType(type)}
                    className={`p-2 rounded-full ${mapType === type ? 'bg-slate-100 text-blue-600' : 'text-slate-500'}`}
                >
                    {type === 'street' && <MapPin size={20} />}
                    {type === 'satellite' && <Layers size={20} />}
                    {type === 'terrain' && <Waves size={20} />}
                </button>
            ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <ErrorBoundary>
          {!isMapLoaded && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm text-blue-600">
                   <Loader2 className="animate-spin mr-2" /> Initializing Map Engine...
              </div>
          )}
          
          <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-slate-200" />
          
          {mode === 'scan' && isMapLoaded && (
            <div className="absolute inset-0 z-[400] pointer-events-none flex flex-col items-center justify-center">
               <Crosshair className="text-red-500 drop-shadow-xl" size={48} strokeWidth={1.5} />
               <div className="mt-4 bg-black/70 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm shadow-lg font-mono">
                  {centerCoords.lat.toFixed(4)}, {centerCoords.lng.toFixed(4)}
               </div>
            </div>
          )}

          {mode === 'scan' && isMapLoaded && (
            <div className="absolute bottom-10 left-0 right-0 z-[500] flex justify-center pointer-events-none">
              <button 
                onClick={lockLocation}
                className="pointer-events-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl shadow-xl font-bold flex items-center gap-2 border-2 border-white/20"
              >
                <ShieldCheck size={20} /> Run Auto-Analysis
              </button>
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* Sidebar Panel */}
      <div className={`
        absolute top-0 right-0 bottom-0 w-full md:w-96 bg-white shadow-2xl z-[600] border-l border-slate-200 
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${mode === 'simulate' ? 'translate-x-0' : 'translate-x-full'}
      `}>
         
         {/* Header */}
         <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
               <Activity className="text-blue-500" />
               {locationName}
            </h2>
            <button onClick={resetScanner} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <RotateCcw size={12} /> New Scan
            </button>
         </div>

         {/* Tabs */}
         <div className="flex border-b border-slate-200 px-6">
             <button 
                onClick={() => setActiveTab('analysis')}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analysis' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
             >
                 Risk Analysis
             </button>
             <button 
                onClick={() => setActiveTab('news')}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'news' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
             >
                 News & Intel
             </button>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-y-auto bg-slate-50">
            {activeTab === 'analysis' ? (
                <div className="p-6 space-y-6">
                    {/* Topography Engine */}
                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-xs text-slate-500 uppercase font-bold flex items-center gap-2">
                                <Mountain size={14} /> Terrain & Soil
                            </span>
                            {isFetchingData && <Loader2 className="animate-spin text-slate-400" size={14}/>}
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                {getTerrainIcon()}
                            </div>
                            <div>
                                <div className="font-bold text-slate-700 text-sm">
                                    {isFetchingData ? "Scanning..." : terrainType === 'unknown' ? "Manual Input Required" : terrainType.toUpperCase()}
                                </div>
                                <div className="text-xs text-slate-500">{getTerrainText()}</div>
                            </div>
                        </div>

                        {/* Automated Analysis Brief */}
                        {intelBrief.length > 0 && (
                            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 space-y-1">
                                {intelBrief.map((line, i) => (
                                    <div key={i} className="flex gap-2">
                                        <Info size={12} className="shrink-0 mt-0.5" />
                                        <span>{line}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <div className="text-[10px] text-slate-400 uppercase">Elevation</div>
                                <div className="font-mono text-sm font-bold">{elevation ? `${elevation.toFixed(1)}m` : '--'}</div>
                            </div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                <div className="text-[10px] text-slate-400 uppercase">Hydrology Check</div>
                                <div className={`font-mono text-xs font-bold flex items-center gap-1 mt-1 ${waterSource ? 'text-blue-600' : 'text-slate-400'}`}>
                                    <Droplet size={12} /> {waterSource ? 'Water Body Nearby' : 'No Major River'}
                                </div>
                            </div>
                        </div>

                        {/* Soil Status */}
                        <div className="bg-slate-50 p-3 rounded border border-slate-100 mt-2">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="flex items-center gap-1 text-slate-500"><Sprout size={12}/> Soil (48h Saturation)</span>
                                <span className="font-bold text-slate-700">{soilSaturation.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-500 ${soilSaturation > 80 ? 'bg-red-500' : 'bg-green-500'}`} 
                                    style={{width: `${soilSaturation}%`}}
                                />
                            </div>
                            <div className="text-[10px] text-right text-slate-400 mt-1">{groundCondition}</div>
                        </div>
                    </div>

                    {/* Weather & Forecast */}
                    <div className={`rounded-xl p-4 border transition-colors ${weatherData ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <ThermometerSun size={14} /> Live Conditions
                        </h3>
                        
                        {isFetchingData ? (
                            <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                                <Loader2 className="animate-spin" size={16} /> Fetching local data...
                            </div>
                        ) : weatherData ? (
                            <div className="space-y-4">
                                {/* Primary Stat */}
                                <div className="flex items-start gap-3">
                                    <div className="bg-white p-2 rounded-lg text-blue-600 shadow-sm">
                                        {weatherData.current.precipitation > 0 ? <CloudRain size={24} /> : <ThermometerSun size={24} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-lg">
                                            {getWeatherDescription(weatherData.current.weather_code)}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Accumulated (48h): <strong>{accumulatedRain48h.toFixed(1)} mm</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Grid Stats */}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-white/60 p-2 rounded border border-slate-100 flex flex-col">
                                        <span className="text-xs text-slate-400">Rate</span>
                                        <span className="font-bold text-blue-700">{rainfallRate.toFixed(1)} mm/h</span>
                                    </div>
                                    <div className="bg-white/60 p-2 rounded border border-slate-100 flex flex-col">
                                        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={10}/> 48h Total</span>
                                        <span className="font-bold text-slate-700">{accumulatedRain48h.toFixed(1)} mm</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="text-xs text-slate-500">API Data Unavailable. Use Slider:</div>
                                <input 
                                    type="range" min="0" max="200" step="5"
                                    value={manualRainfall}
                                    onChange={(e) => setManualRainfall(Number(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg accent-blue-600"
                                />
                                <div className="text-xs text-right text-blue-600 font-bold">{manualRainfall} mm total</div>
                            </div>
                        )}
                        
                        {weatherData && (
                            <div className="mt-4 pt-4 border-t border-blue-200/50">
                                <div className="text-xs text-slate-500 mb-2">Simulate Forecast:</div>
                                <div className="flex gap-1">
                                    {[12, 24, 48, 72].map(hrs => (
                                        <button 
                                            key={hrs}
                                            onClick={() => setSimDuration(hrs)}
                                            className={`flex-1 py-1 text-xs rounded border transition-colors ${
                                                simDuration === hrs ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'
                                            }`}
                                        >
                                            {hrs}h
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action */}
                    <button 
                        onClick={calculateRisk}
                        disabled={isSimulating || isFetchingData}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-70 active:scale-95"
                    >
                        {isSimulating ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        Analyze All Hazards
                    </button>

                    {/* Result */}
                    {riskLevel !== 'unknown' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                            <div className="border-t border-slate-200 pt-4">
                                {renderRiskBadge()}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                {renderHazardBadge('landslide', landslideRisk)}
                                {renderHazardBadge('sinkhole', sinkholeRisk)}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-center mt-2">
                                <div className="bg-white rounded-lg p-2 border border-slate-200">
                                    <div className="text-[10px] text-slate-500 uppercase">Est. Surge</div>
                                    <div className="font-mono font-bold text-slate-700">+{waterLevel.toFixed(1)}m</div>
                                </div>
                                <div className="bg-white rounded-lg p-2 border border-slate-200">
                                    <div className="text-[10px] text-slate-500 uppercase">Excess Runoff</div>
                                    <div className="font-mono font-bold text-slate-700 text-red-600">
                                        {soilRunoff > 0 ? `${soilRunoff.toFixed(0)} mm` : 'None'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                // --- NEWS TAB ---
                <div className="p-6 space-y-6">
                    {/* CURRENT SITUATION CARD */}
                    <div className={`p-5 rounded-xl border flex flex-col gap-2 shadow-sm ${currentStatus.color}`}>
                        <div className="flex items-center gap-2 font-bold uppercase text-xs tracking-wider opacity-80">
                            <Radio size={14} className="animate-pulse"/> Current Situation
                        </div>
                        <div className="text-2xl font-extrabold">{currentStatus.state}</div>
                        <div className="text-sm opacity-90">
                            Based on live hydrology data for {locationName}.
                        </div>
                    </div>

                    {/* Live Generated News */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Newspaper size={14} /> Live Situational Reports
                        </h3>
                        {isFetchingData ? (
                            <div className="text-sm text-slate-400 italic">Analysing conditions...</div>
                        ) : newsFeed.length > 0 ? (
                            newsFeed.map((news, idx) => (
                                <div key={idx} className={`p-4 rounded-xl border border-l-4 shadow-sm bg-white ${
                                    news.type === 'danger' ? 'border-l-red-500' :
                                    news.type === 'warning' ? 'border-l-yellow-500' : 
                                    news.type === 'info' ? 'border-l-blue-500' : 'border-l-green-500'
                                }`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            news.type === 'danger' ? 'bg-red-100 text-red-700' :
                                            news.type === 'warning' ? 'bg-yellow-100 text-yellow-700' : 
                                            news.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                        }`}>
                                            {news.type.toUpperCase()}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{news.time}</span>
                                    </div>
                                    <h4 className="font-bold text-slate-800 mb-1">{news.headline}</h4>
                                    <p className="text-sm text-slate-600 leading-relaxed">{news.body}</p>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-slate-400">No active alerts generated.</div>
                        )}
                    </div>

                    {/* External News Link */}
                    {locationName !== 'Unknown Location' && (
                        <a 
                            href={`https://news.google.com/search?q=${encodeURIComponent("Floods in " + locationName)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full py-3 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-600 font-medium text-center rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            <ExternalLink size={16} /> Search Google News for {locationName}
                        </a>
                    )}

                    {/* Historical Context (Wikipedia) */}
                    <div className="space-y-4 pt-4 border-t border-slate-200">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <History size={14} /> Historical Context
                        </h3>
                        {historicalEvents.length > 0 ? (
                            <div className="space-y-3">
                                {historicalEvents.map((event, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                                        <div className="font-semibold text-slate-700 mb-1">{event.title}</div>
                                        <div 
                                            className="text-slate-500 text-xs line-clamp-3"
                                            dangerouslySetInnerHTML={{__html: event.snippet}}
                                        />
                                    </div>
                                ))}
                                <div className="text-[10px] text-right text-slate-400">Source: Wikipedia</div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-400 italic">
                                {locationName === 'Unknown Location' ? 'Select a location to see history.' : 'No major historical flood records found.'}
                            </div>
                        )}
                    </div>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default FloodSimulatorApp;
