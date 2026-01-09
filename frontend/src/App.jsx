import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Activity, Zap, AlertCircle, TrendingUp, Info, Cloud, Wind, Droplets, Sun, CloudRain, Lightbulb, BarChart3, Car, Navigation, Clock, Calendar, MapPin, Search, Map as MapIcon, X, Leaf } from 'lucide-react';

export default function App() {
  const [domain, setDomain] = useState('transport');
  const [formData, setFormData] = useState({
    distance_km: 5,
    kwh: 2,
    hour: 12,
    day_of_week: 3,
    is_weekend: 0,
    location: 'UK',
    vehicle_type: 'petrol_car',
    start_lat: null,
    start_lon: null,
    end_lat: null,
    end_lon: null,
    start_location_name: '',
    end_location_name: ''
  });
  const [locationSearch, setLocationSearch] = useState({
    start: '',
    end: '',
    startSuggestions: [],
    endSuggestions: [],
    searchingStart: false,
    searchingEnd: false
  });
  const [showMap, setShowMap] = useState(false);
  const [mapMode, setMapMode] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const [predictions, setPredictions] = useState(null);
  const [optimization, setOptimization] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingOptimization, setLoadingOptimization] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const payload = {
        domain,
        hour: parseInt(formData.hour),
        day_of_week: parseInt(formData.day_of_week),
        is_weekend: parseInt(formData.is_weekend),
        location: formData.location,
        vehicle_type: formData.vehicle_type,
        start_lat: formData.start_lat,
        start_lon: formData.start_lon,
        end_lat: formData.end_lat,
        end_lon: formData.end_lon,
        ...(domain === 'transport' ? { distance_km: parseFloat(formData.distance_km) } : { kwh: parseFloat(formData.kwh) })
      };

      console.log('🚀 Sending payload:', payload);

      const response = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Prediction failed');
      
      const data = await response.json();
      console.log('✅ Received full response:', data);
      
      setPredictions(data);
      
      setHistory(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        domain,
        input: domain === 'transport' ? formData.distance_km : formData.kwh,
        bayesian: data.predictions.bayesian?.mean || 0
      }].slice(-10));
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setLoadingOptimization(true);
    
    try {
      const payload = {
        domain,
        hour: parseInt(formData.hour),
        day_of_week: parseInt(formData.day_of_week),
        is_weekend: parseInt(formData.is_weekend),
        location: formData.location,
        vehicle_type: formData.vehicle_type,
        ...(domain === 'transport' ? { distance_km: parseFloat(formData.distance_km) } : { kwh: parseFloat(formData.kwh) })
      };

      const response = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Optimization failed');
      
      const data = await response.json();
      setOptimization(data.optimization);
      
    } catch (err) {
      console.error('Optimization error:', err);
      setError(err.message);
    } finally {
      setLoadingOptimization(false);
    }
  };

  const searchLocation = async (query, type) => {
    if (!query || query.length < 3) {
      setLocationSearch(prev => ({
        ...prev,
        [type === 'start' ? 'startSuggestions' : 'endSuggestions']: []
      }));
      return;
    }

    setLocationSearch(prev => ({
      ...prev,
      [type === 'start' ? 'searchingStart' : 'searchingEnd']: true
    }));

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CarbonSense/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setLocationSearch(prev => ({
          ...prev,
          [type === 'start' ? 'startSuggestions' : 'endSuggestions']: data,
          [type === 'start' ? 'searchingStart' : 'searchingEnd']: false
        }));
      }
    } catch (err) {
      console.error('Location search error:', err);
      setLocationSearch(prev => ({
        ...prev,
        [type === 'start' ? 'searchingStart' : 'searchingEnd']: false
      }));
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedSearch = debounce(searchLocation, 500);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (showMap && mapRef.current && !mapInstanceRef.current) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        const L = window.L;
        
        const map = L.map(mapRef.current).setView([51.505, -0.09], 6);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        mapInstanceRef.current = map;
        
        const handleClick = (e) => {
          if (mapMode === 'start') {
            setStartMarker(e.latlng.lat, e.latlng.lng);
            setMapMode('end');
          } else if (mapMode === 'end') {
            setEndMarker(e.latlng.lat, e.latlng.lng);
          }
        };
        map.on('click', handleClick);
        
        if (formData.start_lat && formData.start_lon) {
          addStartMarkerToMap(formData.start_lat, formData.start_lon);
        }
        if (formData.end_lat && formData.end_lon) {
          addEndMarkerToMap(formData.end_lat, formData.end_lon);
        }
      };
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstanceRef.current && !showMap) {
        if (mapInstanceRef.current._customClickHandler) {
          mapInstanceRef.current.off('click', mapInstanceRef.current._customClickHandler);
        }
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [showMap]);

  useEffect(() => {
    if (mapInstanceRef.current && formData.start_lat && formData.end_lat) {
      drawRouteLine();
    }
  }, [formData.start_lat, formData.start_lon, formData.end_lat, formData.end_lon]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    const handleClick = (e) => {
      if (mapMode === 'start') {
        setStartMarker(e.latlng.lat, e.latlng.lng);
        setMapMode('end'); 
      } else if (mapMode === 'end') {
        setEndMarker(e.latlng.lat, e.latlng.lng);
      }
    };
    
    map.off('click');
    map.on('click', handleClick);
    
    return () => map.off('click', handleClick);
  }, [mapMode, showMap, formData.start_lat, formData.start_lon, formData.end_lat, formData.end_lon]);

  const addStartMarkerToMap = (lat, lng) => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    
    if (startMarkerRef.current) {
      mapInstanceRef.current.removeLayer(startMarkerRef.current);
    }
    
    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: #10b981; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px;">🔵</div>',
        iconSize: [30, 30]
      })
    }).addTo(mapInstanceRef.current);
    
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      setStartMarker(pos.lat, pos.lng);
    });
    
    startMarkerRef.current = marker;
    mapInstanceRef.current.setView([lat, lng], 12);
  };

  const addEndMarkerToMap = (lat, lng) => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    
    if (endMarkerRef.current) {
      mapInstanceRef.current.removeLayer(endMarkerRef.current);
    }
    
    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px;">🔴</div>',
        iconSize: [30, 30]
      })
    }).addTo(mapInstanceRef.current);
    
    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      setEndMarker(pos.lat, pos.lng);
    });
    
    endMarkerRef.current = marker;
  };

  const drawRouteLine = () => {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    
    if (routeLineRef.current) {
      mapInstanceRef.current.removeLayer(routeLineRef.current);
    }
    
    const line = L.polyline([
      [formData.start_lat, formData.start_lon],
      [formData.end_lat, formData.end_lon]
    ], {
      color: '#10b981',
      weight: 4,
      opacity: 0.7,
      dashArray: '10, 10'
    }).addTo(mapInstanceRef.current);
    
    routeLineRef.current = line;
    
    const bounds = L.latLngBounds(
      [formData.start_lat, formData.start_lon],
      [formData.end_lat, formData.end_lon]
    );
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  const setStartMarker = async (lat, lng) => {
    setFormData(prev => ({
      ...prev,
      start_lat: lat,
      start_lon: lng
    }));
    
    addStartMarkerToMap(lat, lng);
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'CarbonSense/1.0' } }
      );
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          start_location_name: data.display_name
        }));
        setLocationSearch(prev => ({
          ...prev,
          start: data.display_name
        }));
      }
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
    }
    
    if (formData.end_lat && formData.end_lon) {
      calculateDistance(lat, lng, formData.end_lat, formData.end_lon);
    }
  };

  const setEndMarker = async (lat, lng) => {
    setFormData(prev => ({
      ...prev,
      end_lat: lat,
      end_lon: lng
    }));
    
    addEndMarkerToMap(lat, lng);
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'CarbonSense/1.0' } }
      );
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          end_location_name: data.display_name
        }));
        setLocationSearch(prev => ({
          ...prev,
          end: data.display_name
        }));
      }
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
    }
    
    if (formData.start_lat && formData.start_lon) {
      calculateDistance(formData.start_lat, formData.start_lon, lat, lng);
    }
  };

  const openMapForLocation = (type) => {
    setMapMode(type);
    setShowMap(true);
  };

  const handleLocationSelect = (location, type) => {
    const lat = parseFloat(location.lat);
    const lon = parseFloat(location.lon);
    const name = location.display_name;

    if (type === 'start') {
      setFormData(prev => ({
        ...prev,
        start_lat: lat,
        start_lon: lon,
        start_location_name: name
      }));
      setLocationSearch(prev => ({
        ...prev,
        start: name,
        startSuggestions: []
      }));
      
      if (showMap && mapInstanceRef.current) {
        addStartMarkerToMap(lat, lon);
      }
    } else {
      setFormData(prev => ({
        ...prev,
        end_lat: lat,
        end_lon: lon,
        end_location_name: name
      }));
      setLocationSearch(prev => ({
        ...prev,
        end: name,
        endSuggestions: []
      }));
      
      if (showMap && mapInstanceRef.current) {
        addEndMarkerToMap(lat, lon);
      }
    }

    if (type === 'start' && formData.end_lat && formData.end_lon) {
      calculateDistance(lat, lon, formData.end_lat, formData.end_lon);
    } else if (type === 'end' && formData.start_lat && formData.start_lon) {
      calculateDistance(formData.start_lat, formData.start_lon, lat, lon);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    setFormData(prev => ({
      ...prev,
      distance_km: distance.toFixed(2)
    }));
  };

  const clearLocation = (type) => {
    if (type === 'start') {
      setFormData(prev => ({
        ...prev,
        start_lat: null,
        start_lon: null,
        start_location_name: ''
      }));
      setLocationSearch(prev => ({
        ...prev,
        start: '',
        startSuggestions: []
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        end_lat: null,
        end_lon: null,
        end_location_name: ''
      }));
      setLocationSearch(prev => ({
        ...prev,
        end: '',
        endSuggestions: []
      }));
    }
  };

  const modelColors = {
    linear: '#10b981',
    rf: '#34d399',
    xgb: '#6ee7b7',
    bayesian: '#059669',
    context_aware: '#047857',
    traffic_aware: '#065f46'
  };

  const modelComparisonData = predictions?.predictions ? Object.entries(predictions.predictions).map(([name, data]) => ({
    name: name.toUpperCase(),
    value: data.mean || 0,
    color: modelColors[name]
  })) : [];

  const uncertaintyData = predictions?.predictions?.bayesian ? [
    { label: 'Lower', value: predictions.predictions.bayesian.ci_lower },
    { label: 'Mean', value: predictions.predictions.bayesian.mean },
    { label: 'Upper', value: predictions.predictions.bayesian.ci_upper }
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                <Leaf className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  CarbonSense
                </h1>
                <p className="text-sm text-gray-600">AI-Powered Carbon Tracking & Optimization</p>
              </div>
            </div>
            {/* <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">18K+</div>
                <div className="text-gray-600">Trips Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">10</div>
                <div className="text-gray-600">ML Models</div>
              </div>
            </div> */}
          </div>
        </div>
      </div>

      {/* Hero Section with Image */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Track Your Carbon Footprint with <span className="text-green-600">Precision</span>
              </h2>
              <p className="text-lg text-gray-700 mb-6">
                Advanced machine learning models analyze your transport and energy usage, providing accurate carbon emission predictions with real-time context awareness.
              </p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Weather Impact</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Traffic Analysis</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">24h Optimization</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-white">
              <img 
                src="https://images.unsplash.com/photo-1683632398898-81d7db605188" 
                alt="Renewable Energy"
                className="w-full h-80 object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sticky top-6" data-testid="input-parameters-card">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Zap className="w-6 h-6 text-green-600" />
              Input Parameters
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Domain</label>
              <div className="flex gap-2">
                {['transport', 'energy'].map(d => (
                  <button
                    key={d}
                    data-testid={`domain-${d}-button`}
                    onClick={() => setDomain(d)}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      domain === d 
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d === 'transport' ? '🚗 Transport' : '⚡ Energy'}
                  </button>
                ))}
              </div>
            </div>

            {domain === 'transport' ? (
              <>
                <div className="mb-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-200" data-testid="route-planner-section">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-green-800 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Route Planner
                    </h3>
                    <button
                      data-testid="open-map-button"
                      onClick={() => openMapForLocation('start')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md"
                    >
                      <MapIcon className="w-3 h-3" />
                      Open Map
                    </button>
                  </div>

                  <div className="mb-3 relative">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      🔵 Start Point
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        data-testid="start-location-input"
                        placeholder="Search start location..."
                        value={locationSearch.start}
                        onChange={(e) => {
                          setLocationSearch(prev => ({ ...prev, start: e.target.value }));
                          debouncedSearch(e.target.value, 'start');
                        }}
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                      />
                      {formData.start_lat && (
                        <button
                          data-testid="clear-start-location-button"
                          onClick={() => clearLocation('start')}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {locationSearch.startSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border-2 border-green-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {locationSearch.startSuggestions.map((suggestion, idx) => (
                          <div
                            key={idx}
                            data-testid={`start-suggestion-${idx}`}
                            onClick={() => handleLocationSelect(suggestion, 'start')}
                            className="px-3 py-2 hover:bg-green-50 cursor-pointer border-b border-gray-100 last:border-0"
                          >
                            <div className="text-sm text-gray-900">{suggestion.display_name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {formData.start_location_name && (
                      <div className="mt-2 text-xs text-green-700 flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                        <MapPin className="w-3 h-3" />
                        Selected: {formData.start_location_name.split(',')[0]}
                      </div>
                    )}
                  </div>

                  <div className="mb-3 relative">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      🔴 End Point
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        data-testid="end-location-input"
                        placeholder="Search end location..."
                        value={locationSearch.end}
                        onChange={(e) => {
                          setLocationSearch(prev => ({ ...prev, end: e.target.value }));
                          debouncedSearch(e.target.value, 'end');
                        }}
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-white rounded-lg border-2 border-gray-300 focus:border-red-500 focus:outline-none"
                      />
                      {formData.end_lat && (
                        <button
                          data-testid="clear-end-location-button"
                          onClick={() => clearLocation('end')}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {locationSearch.endSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border-2 border-red-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {locationSearch.endSuggestions.map((suggestion, idx) => (
                          <div
                            key={idx}
                            data-testid={`end-suggestion-${idx}`}
                            onClick={() => handleLocationSelect(suggestion, 'end')}
                            className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b border-gray-100 last:border-0"
                          >
                            <div className="text-sm text-gray-900">{suggestion.display_name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {formData.end_location_name && (
                      <div className="mt-2 text-xs text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                        <MapPin className="w-3 h-3" />
                        Selected: {formData.end_location_name.split(',')[0]}
                      </div>
                    )}
                  </div>

                  {formData.start_lat && formData.end_lat && (
                    <div className="bg-white border-2 border-green-400 rounded-xl p-4 flex items-center justify-between shadow-md" data-testid="calculated-distance-display">
                      <div>
                        <div className="text-xs text-green-700 font-semibold">Calculated Distance</div>
                        <div className="text-3xl font-bold text-green-600">{formData.distance_km} km</div>
                      </div>
                      <Navigation className="w-10 h-10 text-green-500" />
                    </div>
                  )}
                </div>

                <details className="mb-4">
                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900 mb-2 font-medium">
                    Or enter distance manually
                  </summary>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Distance (km)</label>
                    <input
                      type="number"
                      data-testid="distance-input"
                      value={formData.distance_km}
                      onChange={e => setFormData({...formData, distance_km: e.target.value})}
                      className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                      step="0.1"
                      min="0"
                    />
                  </div>
                </details>
              </>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Energy (kWh)</label>
                <input
                  type="number"
                  data-testid="energy-input"
                  value={formData.kwh}
                  onChange={e => setFormData({...formData, kwh: e.target.value})}
                  className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                  step="0.1"
                  min="0"
                />
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">📍 Location</label>
              <select
                data-testid="location-select"
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
              >
                <option value="UK">🇬🇧 United Kingdom (London)</option>
                <option value="California">🇺🇸 California (San Francisco)</option>
                <option value="India">🇮🇳 India (Hyderabad)</option>
              </select>
            </div>
            
            {domain === 'transport' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">🚗 Vehicle Type</label>
                <select
                  data-testid="vehicle-type-select"
                  value={formData.vehicle_type}
                  onChange={e => setFormData({...formData, vehicle_type: e.target.value})}
                  className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                >
                  <option value="petrol_car">⛽ Petrol Car (0.17 kg/km)</option>
                  <option value="diesel_car">🛢️ Diesel Car (0.165 kg/km)</option>
                  <option value="hybrid">🔋 Hybrid (0.11 kg/km)</option>
                  <option value="electric">⚡ Electric (0.053 kg/km)</option>
                  <option value="motorcycle">🏍️ Motorcycle (0.113 kg/km)</option>
                  <option value="bus">🚌 Bus (0.089 kg/km)</option>
                  <option value="train">🚆 Train (0.041 kg/km)</option>
                  <option value="bicycle">🚴 Bicycle (0 kg/km)</option>
                  <option value="walking">🚶 Walking (0 kg/km)</option>
                </select>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hour (0-23)</label>
              <input
                type="number"
                data-testid="hour-input"
                value={formData.hour}
                onChange={e => setFormData({...formData, hour: e.target.value})}
                className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                min="0"
                max="23"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Day of Week (0=Mon, 6=Sun)</label>
              <input
                type="number"
                data-testid="day-of-week-input"
                value={formData.day_of_week}
                onChange={e => setFormData({...formData, day_of_week: e.target.value})}
                className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                min="0"
                max="6"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Weekend</label>
              <select
                data-testid="weekend-select"
                value={formData.is_weekend}
                onChange={e => setFormData({...formData, is_weekend: e.target.value})}
                className="w-full px-4 py-3 bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>

            <button
              data-testid="predict-button"
              onClick={handlePredict}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {loading ? 'Predicting...' : '🚀 Predict Emissions'}
            </button>

            <button
              data-testid="optimize-button"
              onClick={handleOptimize}
              disabled={loadingOptimization}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingOptimization ? 'Optimizing...' : '⏰ Find Best Time (24h)'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border-2 border-red-300 rounded-lg flex items-start gap-2" data-testid="error-message">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2 space-y-6">
          {optimization && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 shadow-lg border-2 border-purple-200" data-testid="optimization-results-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-md">
                  <Clock className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    ⏰ Optimal Timing Analysis
                  </h3>
                  <div className="text-sm text-gray-700">
                    {optimization.recommendation}
                  </div>
                </div>
              </div>

              {optimization.current_time && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white rounded-xl p-4 border-2 border-yellow-200">
                    <div className="text-sm text-gray-600 mb-1 font-semibold">Current Time</div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {optimization.current_time.time}
                    </div>
                    <div className="text-sm text-gray-600">
                      {optimization.current_time.estimated_emissions.toFixed(3)} kg CO₂
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 border-2 border-green-200">
                    <div className="text-sm text-gray-600 mb-1 font-semibold">Optimal Time</div>
                    <div className="text-2xl font-bold text-green-600">
                      {optimization.optimal_time.time}
                    </div>
                    <div className="text-sm text-gray-600">
                      {optimization.optimal_time.estimated_emissions.toFixed(3)} kg CO₂
                    </div>
                  </div>
                </div>
              )}

              {optimization.potential_savings.percent > 0 && (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-4">
                  <div className="text-lg font-bold text-green-700">
                    💰 Potential Savings: {optimization.potential_savings.percent}%
                  </div>
                  <div className="text-sm text-gray-700">
                    Save {optimization.potential_savings.absolute_kg.toFixed(3)} kg CO₂ by timing your activity optimally
                  </div>
                </div>
              )}

              {optimization.insights && optimization.insights.length > 0 && (
                <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-4 mb-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-2">💡 Key Insights:</h4>
                  <ul className="space-y-1">
                    {optimization.insights.map((insight, i) => (
                      <li key={i} className="text-sm text-gray-700">{insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  Top 5 Best Times
                </h4>
                <div className="space-y-2">
                  {optimization.best_times.map((time, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-3 flex items-center justify-between border-2 border-green-100 shadow-sm">
                      <div>
                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                          #{idx + 1} {time.time} ({time.day})
                          {time.confidence && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              time.confidence === 'high' ? 'bg-green-100 text-green-700' :
                              time.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {time.confidence}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {domain === 'energy' 
                            ? `Grid: ${time.grid_intensity?.toFixed(0)} gCO₂/kWh`
                            : `Traffic: ${time.traffic_factor}x multiplier`
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {time.estimated_emissions.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-600">kg CO₂</div>
                        {time.savings_percent > 0 && (
                          <div className="text-xs text-green-600 font-semibold">-{time.savings_percent}%</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  Times to Avoid
                </h4>
                <div className="space-y-2">
                  {optimization.worst_times.map((time, idx) => (
                    <div key={idx} className="bg-red-50 border-2 border-red-200 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {time.time} ({time.day})
                        </div>
                        <div className="text-xs text-gray-600">
                          {domain === 'energy' 
                            ? `Grid: ${time.grid_intensity?.toFixed(0)} gCO₂/kWh`
                            : `Traffic: ${time.traffic_factor}x multiplier`
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-600">
                          {time.estimated_emissions.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-600">kg CO₂</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {predictions?.context_score && (
            <div className={`rounded-2xl p-6 shadow-lg border-2 ${
              predictions.context_score.rating_color === 'green' ? 'bg-green-50 border-green-300' :
              predictions.context_score.rating_color === 'lime' ? 'bg-lime-50 border-lime-300' :
              predictions.context_score.rating_color === 'yellow' ? 'bg-yellow-50 border-yellow-300' :
              predictions.context_score.rating_color === 'orange' ? 'bg-orange-50 border-orange-300' :
              'bg-red-50 border-red-300'
            }`} data-testid="context-score-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-1">
                    {predictions.context_score.rating_emoji} Context Score: {predictions.context_score.score}/100
                  </h3>
                  <div className="text-xl font-semibold text-gray-700">
                    {predictions.context_score.rating}
                  </div>
                </div>
                <div className="text-5xl">{predictions.context_score.rating_emoji}</div>
              </div>
              
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-4 rounded-full transition-all duration-500 ${
                      predictions.context_score.rating_color === 'green' ? 'bg-green-500' :
                      predictions.context_score.rating_color === 'lime' ? 'bg-lime-500' :
                      predictions.context_score.rating_color === 'yellow' ? 'bg-yellow-500' :
                      predictions.context_score.rating_color === 'orange' ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${predictions.context_score.score}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-1 font-medium">
                  <span>0 (Worst)</span>
                  <span>50 (Average)</span>
                  <span>100 (Best)</span>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-4 mb-4 border-2 border-gray-200">
                <p className="text-sm text-gray-800 font-medium">
                  {predictions.context_score.message}
                </p>
              </div>
              
              {predictions.context_score.factors.length > 0 && (
                <div className="bg-white rounded-xl p-4 border-2 border-gray-200">
                  <h4 className="text-sm font-bold text-gray-800 mb-2">Contributing Factors:</h4>
                  <ul className="space-y-1">
                    {predictions.context_score.factors.map((factor, i) => (
                      <li key={i} className="text-xs text-gray-700">{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {predictions?.traffic_context && predictions.traffic_context.success && (
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 shadow-lg border-2 border-orange-200" data-testid="traffic-context-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-md">
                    <Car className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">
                      Traffic Impact: {predictions.traffic_context.condition}
                    </h3>
                    <div className="text-sm text-gray-600">
                      {predictions.traffic_context.source}
                    </div>
                  </div>
                </div>
                <div className="text-4xl">
                  {predictions.traffic_context.condition.includes('Heavy') || predictions.traffic_context.condition.includes('Severe') ? '🚗🚙🚕' :
                   predictions.traffic_context.condition.includes('Moderate') ? '🚗🚙' :
                   predictions.traffic_context.condition.includes('Light') ? '🚗' : '🛣️'}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 bg-white rounded-xl p-4 border-2 border-gray-200">
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <Navigation className="w-4 h-4" />
                    Delay Factor
                  </div>
                  <div className="text-3xl font-bold text-orange-600">
                    {predictions.traffic_context.delay_factor}x
                  </div>
                  <div className="text-xs text-gray-600">
                    +{predictions.traffic_context.delay_minutes.toFixed(0)} min delay
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    Emission Impact
                  </div>
                  <div className="text-3xl font-bold text-red-600">
                    +{((predictions.traffic_context.emission_multiplier - 1) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-600">
                    {predictions.traffic_context.emission_multiplier}x multiplier
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <TrendingUp className="w-4 h-4" />
                    Travel Time
                  </div>
                  <div className="text-3xl font-bold text-yellow-600">
                    {predictions.traffic_context.travel_time_minutes.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-600">
                    vs {predictions.traffic_context.travel_time_no_traffic.toFixed(0)} min normal
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-orange-100 border-2 border-orange-300 rounded-xl">
                <div className="text-sm text-gray-800 font-medium">
                  {predictions.traffic_context.message}
                </div>
                {predictions.traffic_context.note && (
                  <div className="text-xs text-gray-700 mt-2">
                    ℹ️ {predictions.traffic_context.note}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {predictions?.weather_context && predictions.weather_context.success && (
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 shadow-lg border-2 border-blue-200" data-testid="weather-context-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-md">
                    <Cloud className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">
                      Weather Impact: {predictions.weather_context.location}
                    </h3>
                    <div className="text-sm text-gray-600">
                      {predictions.weather_context.description}
                    </div>
                  </div>
                </div>
                <div className="text-5xl">
                  {predictions.weather_context.condition === 'Clear' ? '☀️' :
                   predictions.weather_context.condition === 'Clouds' ? '☁️' :
                   predictions.weather_context.condition === 'Rain' ? '🌧️' :
                   predictions.weather_context.condition === 'Snow' ? '❄️' : '🌤️'}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 bg-white rounded-xl p-4 border-2 border-gray-200">
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <Sun className="w-4 h-4" />
                    Temperature
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {predictions.weather_context.temperature}°C
                  </div>
                  <div className="text-xs text-gray-600">
                    Feels like {predictions.weather_context.feels_like}°C
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <Wind className="w-4 h-4" />
                    Wind Speed
                  </div>
                  <div className="text-3xl font-bold text-cyan-600">
                    {predictions.weather_context.wind_speed}
                  </div>
                  <div className="text-xs text-gray-600">m/s</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 font-semibold">
                    <Droplets className="w-4 h-4" />
                    Humidity
                  </div>
                  <div className="text-3xl font-bold text-blue-600">
                    {predictions.weather_context.humidity}%
                  </div>
                  <div className="text-xs text-gray-600">
                    {predictions.weather_context.clouds}% clouds
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-blue-100 border-2 border-blue-300 rounded-xl">
                <div className="text-sm font-bold text-blue-800 mb-2">
                  {domain === 'energy' ? '⚡ Grid Impact' : '🚗 Fuel Efficiency Impact'}
                </div>
                {domain === 'energy' ? (
                  <>
                    <div className="text-sm text-gray-800">
                      Carbon Impact: {predictions.weather_context.impact.score > 0 ? '📈' : '📉'} 
                      {Math.abs(predictions.weather_context.impact.score)}% {predictions.weather_context.impact.score > 0 ? 'increase' : 'decrease'}
                    </div>
                    <div className="text-xs text-gray-700 mt-1">{predictions.weather_context.impact.message}</div>
                  </>
                ) : (
                  <div className="text-sm text-gray-800">
                    {predictions.predictions?.context_aware?.adjustments?.weather_multiplier && (
                      <>
                        Fuel consumption: {((predictions.predictions.context_aware.adjustments.weather_multiplier - 1) * 100).toFixed(0) > 0 ? '+' : ''}
                        {((predictions.predictions.context_aware.adjustments.weather_multiplier - 1) * 100).toFixed(0)}% 
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {predictions?.grid_context && (
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-green-200" data-testid="grid-context-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-md">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    Live Grid: {predictions.grid_context.location}
                  </h3>
                  <div className="text-sm text-gray-600">
                    {predictions.grid_context.source}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 bg-green-50 rounded-xl p-4 border-2 border-green-200">
                <div>
                  <div className="text-sm text-gray-700 font-semibold">Current Intensity</div>
                  <div className="text-4xl font-bold text-green-600">
                    {predictions.grid_context.intensity_gco2_kwh.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-600">gCO₂/kWh</div>
                </div>
                <div>
                  <div className="text-sm text-gray-700 font-semibold">vs. Average</div>
                  <div className={`text-3xl font-bold ${predictions.grid_context.comparison?.difference_percent < 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    {predictions.grid_context.comparison?.difference_percent > 0 ? '+' : ''}
                    {predictions.grid_context.comparison?.difference_percent.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-700 mt-1">
                    {predictions.grid_context.comparison?.message}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 text-xs text-gray-600 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Updated: {new Date(predictions.grid_context.timestamp).toLocaleString()}
              </div>
            </div>
          )}

          {predictions?.predictions && (
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200" data-testid="model-predictions-card">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-green-600" />
                Model Predictions Comparison
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={modelComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px', fontWeight: '600' }}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    label={{ value: 'CO₂ (kg)', angle: -90, position: 'insideLeft', style: { fill: '#6b7280' } }}
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #e5e7eb', borderRadius: '12px' }}
                    labelStyle={{ color: '#111827', fontWeight: 'bold' }}
                    itemStyle={{ color: '#374151' }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} label={{ position: 'top', fill: '#111827', fontSize: 12, fontWeight: 'bold', formatter: (value) => value.toFixed(2) }}>
                    {modelComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
                {Object.entries(predictions.predictions).map(([name, data]) => (
                  <div key={name} className="bg-green-50 rounded-xl p-3 border-2 border-green-200">
                    <div className="text-xs text-gray-700 uppercase font-bold">{name}</div>
                    <div className="text-xl font-bold mt-1" style={{ color: modelColors[name] || '#059669' }}>
                      {(data.mean || 0).toFixed(3)}
                    </div>
                    <div className="text-xs text-gray-600">kg CO₂</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {predictions?.predictions?.bayesian && (
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200" data-testid="bayesian-uncertainty-card">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Info className="w-6 h-6 text-purple-600" />
                Bayesian Uncertainty (95% CI)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={uncertaintyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #e5e7eb', borderRadius: '12px' }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
                <p className="text-sm text-gray-800 font-semibold">
                  <strong>Confidence Interval:</strong> [{predictions.predictions.bayesian.ci_lower.toFixed(2)}, {predictions.predictions.bayesian.ci_upper.toFixed(2)}] kg CO₂
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Standard Deviation: {predictions.predictions.bayesian.std.toFixed(2)} kg
                </p>
              </div>
            </div>
          )}

          {predictions?.explainability && Object.keys(predictions.explainability).length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200" data-testid="explainability-card">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Lightbulb className="w-6 h-6 text-yellow-500" />
                AI Explainability - Why This Prediction?
              </h3>
              
              {Object.entries(predictions.explainability).map(([modelName, explainData]) => {
                if (explainData.error) return null;
                
                return (
                  <div key={modelName} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-5 h-5" style={{ color: modelColors[modelName] }} />
                      <h4 className="text-lg font-bold uppercase" style={{ color: modelColors[modelName] }}>
                        {modelName} Model Explanation
                      </h4>
                    </div>
                    
                    <div className="bg-green-50 rounded-xl p-4 mb-3 border-2 border-green-200">
                      <p className="text-sm text-gray-800 leading-relaxed font-medium">
                        💡 {explainData.explanation}
                      </p>
                    </div>
                    
                    <div className="text-xs text-gray-600 mb-3 font-medium">
                      Base prediction (average): {explainData.base_value?.toFixed(3)} kg CO₂ 
                      → Final: {explainData.prediction?.toFixed(3)} kg CO₂
                    </div>
                    
                    <div className="space-y-2">
                      {explainData.feature_importance?.map((feature, idx) => {
                        const isPositive = feature.shap_value > 0;
                        const maxAbsValue = Math.max(...explainData.feature_importance.map(f => Math.abs(f.shap_value)));
                        const barWidth = (Math.abs(feature.shap_value) / maxAbsValue) * 100;
                        
                        return (
                          <div key={idx} className="bg-gray-50 rounded-xl p-3 border-2 border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-800">
                                {feature.feature}
                                <span className="text-xs text-gray-600 ml-2">
                                  (value: {typeof feature.value === 'number' ? feature.value.toFixed(2) : feature.value})
                                </span>
                              </span>
                              <span className={`text-sm font-bold ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
                                {isPositive ? '+' : ''}{feature.shap_value.toFixed(3)} kg
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${isPositive ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-600 font-medium">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>Increases emissions</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Decreases emissions</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200" data-testid="prediction-history-card">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Prediction History</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="timestamp" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #e5e7eb', borderRadius: '12px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="bayesian" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Map Modal */}
      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" data-testid="map-modal">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <MapIcon className="w-6 h-6 text-green-600" />
                  Interactive Route Map
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {mapMode === 'start' 
                    ? '🔵 Click or drag the blue marker to set start point' 
                    : mapMode === 'end'
                    ? '🔴 Click or drag the red marker to set end point'
                    : 'Click on the map to place markers or drag existing ones'}
                </p>
              </div>
              <button
                data-testid="close-map-button"
                onClick={() => setShowMap(false)}
                className="w-10 h-10 bg-red-500 hover:bg-red-600 rounded-xl flex items-center justify-center transition-all"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-4 bg-gray-50 space-y-3 border-b-2 border-gray-200">
              <div className="flex gap-2">
                <button
                  data-testid="map-set-start-button"
                  onClick={() => setMapMode('start')}
                  className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-all ${
                    mapMode === 'start'
                      ? 'bg-green-500 text-white shadow-lg'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  🔵 Set Start Point
                </button>
                <button
                  data-testid="map-set-end-button"
                  onClick={() => setMapMode('end')}
                  className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-all ${
                    mapMode === 'end'
                      ? 'bg-red-500 text-white shadow-lg'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  🔴 Set End Point
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    🔵 Search Start Location
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      data-testid="map-start-search-input"
                      placeholder="Search start..."
                      value={locationSearch.start}
                      onChange={(e) => {
                        setLocationSearch(prev => ({ ...prev, start: e.target.value }));
                        debouncedSearch(e.target.value, 'start');
                      }}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  
                  {locationSearch.startSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {locationSearch.startSuggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            handleLocationSelect(suggestion, 'start');
                            setMapMode('end'); 
                          }}
                          className="px-3 py-2 hover:bg-green-50 cursor-pointer border-b border-gray-200 last:border-0"
                        >
                          <div className="text-sm text-gray-900">{suggestion.display_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    🔴 Search End Location
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      data-testid="map-end-search-input"
                      placeholder="Search end..."
                      value={locationSearch.end}
                      onChange={(e) => {
                        setLocationSearch(prev => ({ ...prev, end: e.target.value }));
                        debouncedSearch(e.target.value, 'end');
                      }}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white rounded-lg border-2 border-gray-300 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  
                  {locationSearch.endSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {locationSearch.endSuggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleLocationSelect(suggestion, 'end')}
                          className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b border-gray-200 last:border-0"
                        >
                          <div className="text-sm text-gray-900">{suggestion.display_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 relative">
              <div ref={mapRef} className="w-full h-full"></div>
            </div>

            <div className="p-4 bg-gray-50 border-t-2 border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600 text-xs mb-1 font-semibold">🔵 Start Point</div>
                  <div className="text-gray-900 font-medium">
                    {formData.start_location_name 
                      ? formData.start_location_name.split(',').slice(0, 2).join(',')
                      : 'Not set - Click on map'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600 text-xs mb-1 font-semibold">🔴 End Point</div>
                  <div className="text-gray-900 font-medium">
                    {formData.end_location_name 
                      ? formData.end_location_name.split(',').slice(0, 2).join(',')
                      : 'Not set - Click on map'}
                  </div>
                </div>
              </div>
              
              {formData.start_lat && formData.end_lat && (
                <div className="mt-3 bg-green-50 border-2 border-green-400 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-green-700 font-semibold">Route Distance</div>
                    <div className="text-2xl font-bold text-green-600">{formData.distance_km} km</div>
                  </div>
                  <button
                    data-testid="confirm-route-button"
                    onClick={() => setShowMap(false)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all shadow-md"
                  >
                    ✓ Confirm Route
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-center gap-8">
            <img 
              src="https://images.pexels.com/photos/1072824/pexels-photo-1072824.jpeg" 
              alt="Sustainability"
              className="w-24 h-24 rounded-full object-cover border-4 border-green-200 shadow-lg"
            />
            <div className="text-center">
              <h4 className="text-lg font-bold text-gray-900">Building a Sustainable Future Together</h4>
              <p className="text-sm text-gray-600 mt-1">Track, Analyze, and Optimize Your Carbon Footprint</p>
            </div>
            <img 
              src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09" 
              alt="Growth"
              className="w-24 h-24 rounded-full object-cover border-4 border-green-200 shadow-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
