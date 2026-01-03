import { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Activity, Zap, AlertCircle, TrendingUp, Info, Cloud, Wind, Droplets, Sun, CloudRain, Lightbulb, BarChart3, Car, Navigation, Clock, Calendar } from 'lucide-react';

export default function CarbonSenseApp() {
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
    end_lon: null
  });
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
      console.log('📊 Grid context?', data.grid_context);
      console.log('📈 Predictions?', data.predictions);
      
      // Store the ENTIRE response, not just predictions
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

      console.log('🔍 Requesting optimization:', payload);

      const response = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Optimization failed');
      
      const data = await response.json();
      console.log('📊 Optimization data:', data);
      setOptimization(data.optimization);
      
    } catch (err) {
      console.error('Optimization error:', err);
      setError(err.message);
    } finally {
      setLoadingOptimization(false);
    }
  };

  const modelColors = {
    linear: '#3b82f6',
    rf: '#10b981',
    xgb: '#f59e0b',
    bayesian: '#8b5cf6',
    context_aware: '#ec4899',
    traffic_aware: '#f97316'
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-green-900 text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
            <Activity className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              CarbonSense
            </h1>
            <p className="text-gray-400 text-sm">Context-Aware Carbon Tracking with ML Uncertainty</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700 shadow-2xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-400" />
            Input Parameters
          </h2>

          {/* Domain Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Domain</label>
            <div className="flex gap-2">
              {['transport', 'energy'].map(d => (
                <button
                  key={d}
                  onClick={() => setDomain(d)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    domain === d 
                      ? 'bg-green-500 text-white shadow-lg shadow-green-500/50' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {d === 'transport' ? '🚗 Transport' : '⚡ Energy'}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional Input */}
          <div className="mb-4">
            {domain === 'transport' ? (
              <>
                <label className="block text-sm font-medium mb-2">Distance (km)</label>
                <input
                  type="number"
                  value={formData.distance_km}
                  onChange={e => setFormData({...formData, distance_km: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                  step="0.1"
                  min="0"
                />
              </>
            ) : (
              <>
                <label className="block text-sm font-medium mb-2">Energy (kWh)</label>
                <input
                  type="number"
                  value={formData.kwh}
                  onChange={e => setFormData({...formData, kwh: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                  step="0.1"
                  min="0"
                />
              </>
            )}
          </div>
          
          {/* Location Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">📍 Location</label>
            <select
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
              className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
            >
              <option value="UK">🇬🇧 United Kingdom (London)</option>
              <option value="California">🇺🇸 California (San Francisco)</option>
              <option value="India">🇮🇳 India (Hyderabad)</option>
            </select>
          </div>
          
          {/* Vehicle Type Selector (Transport only) */}
          {domain === 'transport' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">🚗 Vehicle Type</label>
              <select
                value={formData.vehicle_type}
                onChange={e => setFormData({...formData, vehicle_type: e.target.value})}
                className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
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
          
          {/* Optional: Route Coordinates for Accurate Traffic */}
          {domain === 'transport' && (
            <div className="mb-4">
              <details className="bg-gray-700 bg-opacity-30 rounded-lg p-3">
                <summary className="text-sm font-medium cursor-pointer text-gray-300 hover:text-white">
                  🗺️ Optional: Set Route Coordinates (Advanced)
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Start Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="e.g., 51.5074"
                        value={formData.start_lat || ''}
                        onChange={e => setFormData({...formData, start_lat: e.target.value ? parseFloat(e.target.value) : null})}
                        className="w-full px-2 py-2 text-sm bg-gray-600 rounded border border-gray-500 focus:border-green-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Start Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="e.g., -0.1278"
                        value={formData.start_lon || ''}
                        onChange={e => setFormData({...formData, start_lon: e.target.value ? parseFloat(e.target.value) : null})}
                        className="w-full px-2 py-2 text-sm bg-gray-600 rounded border border-gray-500 focus:border-green-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">End Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="e.g., 51.5524"
                        value={formData.end_lat || ''}
                        onChange={e => setFormData({...formData, end_lat: e.target.value ? parseFloat(e.target.value) : null})}
                        className="w-full px-2 py-2 text-sm bg-gray-600 rounded border border-gray-500 focus:border-green-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">End Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="e.g., -0.1278"
                        value={formData.end_lon || ''}
                        onChange={e => setFormData({...formData, end_lon: e.target.value ? parseFloat(e.target.value) : null})}
                        className="w-full px-2 py-2 text-sm bg-gray-600 rounded border border-gray-500 focus:border-green-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 Leave empty to use default city center. For accurate traffic, enter your actual route coordinates.
                  </p>
                </div>
              </details>
            </div>
          )}

          {/* Temporal Features */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Hour (0-23)</label>
            <input
              type="number"
              value={formData.hour}
              onChange={e => setFormData({...formData, hour: e.target.value})}
              className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
              min="0"
              max="23"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Day of Week (0=Mon, 6=Sun)</label>
            <input
              type="number"
              value={formData.day_of_week}
              onChange={e => setFormData({...formData, day_of_week: e.target.value})}
              className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
              min="0"
              max="6"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Weekend</label>
            <select
              value={formData.is_weekend}
              onChange={e => setFormData({...formData, is_weekend: e.target.value})}
              className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>

          <button
            onClick={handlePredict}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg font-bold text-lg hover:from-green-600 hover:to-blue-600 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
          >
            {loading ? 'Predicting...' : '🚀 Predict Emissions'}
          </button>

          <button
            onClick={handleOptimize}
            disabled={loadingOptimization}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingOptimization ? 'Optimizing...' : '⏰ Find Best Time (24h)'}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Temporal Optimization Results */}
          {optimization && (
            <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-2xl p-6 shadow-2xl border-2 border-purple-500">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                  <Clock className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    ⏰ Optimal Timing Analysis (Next 24h)
                  </h3>
                  <div className="text-sm text-gray-300">
                    {optimization.recommendation}
                  </div>
                </div>
              </div>

              {/* Current vs Optimal */}
              {optimization.current_time && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-800 bg-opacity-40 rounded-lg p-4">
                    <div className="text-sm text-gray-300 mb-1">Current Time</div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {optimization.current_time.time}
                    </div>
                    <div className="text-sm text-gray-400">
                      {optimization.current_time.estimated_emissions.toFixed(3)} kg CO₂
                    </div>
                  </div>
                  <div className="bg-gray-800 bg-opacity-40 rounded-lg p-4">
                    <div className="text-sm text-gray-300 mb-1">Optimal Time</div>
                    <div className="text-2xl font-bold text-green-400">
                      {optimization.optimal_time.time}
                    </div>
                    <div className="text-sm text-gray-400">
                      {optimization.optimal_time.estimated_emissions.toFixed(3)} kg CO₂
                    </div>
                  </div>
                </div>
              )}

              {/* Potential Savings */}
              {optimization.potential_savings.percent > 0 && (
                <div className="bg-green-500 bg-opacity-20 border border-green-400 rounded-lg p-4 mb-4">
                  <div className="text-lg font-bold text-green-300">
                    💰 Potential Savings: {optimization.potential_savings.percent}%
                  </div>
                  <div className="text-sm text-gray-300">
                    Save {optimization.potential_savings.absolute_kg.toFixed(3)} kg CO₂ by timing your activity optimally
                  </div>
                </div>
              )}

              {/* Insights */}
              {optimization.insights && optimization.insights.length > 0 && (
                <div className="bg-purple-500 bg-opacity-20 border border-purple-400 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-purple-200 mb-2">💡 Key Insights:</h4>
                  <ul className="space-y-1">
                    {optimization.insights.map((insight, i) => (
                      <li key={i} className="text-sm text-gray-300">{insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Best Times */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  Top 5 Best Times
                </h4>
                <div className="space-y-2">
                  {optimization.best_times.map((time, idx) => (
                    <div key={idx} className="bg-gray-800 bg-opacity-40 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                          #{idx + 1} {time.time} ({time.day})
                          {time.confidence && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              time.confidence === 'high' ? 'bg-green-500 bg-opacity-20 text-green-300' :
                              time.confidence === 'medium' ? 'bg-yellow-500 bg-opacity-20 text-yellow-300' :
                              'bg-gray-500 bg-opacity-20 text-gray-300'
                            }`}>
                              {time.confidence} confidence
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {domain === 'energy' 
                            ? `Grid: ${time.grid_intensity?.toFixed(0)} gCO₂/kWh`
                            : `Traffic: ${time.traffic_factor}x multiplier`
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-400">
                          {time.estimated_emissions.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-400">kg CO₂</div>
                        {time.savings_percent > 0 && (
                          <div className="text-xs text-green-400">-{time.savings_percent}%</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Worst Times */}
              <div>
                <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  Times to Avoid
                </h4>
                <div className="space-y-2">
                  {optimization.worst_times.map((time, idx) => (
                    <div key={idx} className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {time.time} ({time.day})
                        </div>
                        <div className="text-xs text-gray-400">
                          {domain === 'energy' 
                            ? `Grid: ${time.grid_intensity?.toFixed(0)} gCO₂/kWh`
                            : `Traffic: ${time.traffic_factor}x multiplier`
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-400">
                          {time.estimated_emissions.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-400">kg CO₂</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Methodology & Confidence */}
              {optimization.methodology && (
                <div className="mt-4 bg-gray-800 bg-opacity-40 border border-gray-600 rounded-lg p-4">
                  <details>
                    <summary className="text-sm font-semibold text-gray-300 cursor-pointer hover:text-white">
                      📊 Forecast Methodology & Confidence
                    </summary>
                    <div className="mt-3 space-y-2 text-xs text-gray-400">
                      <div>
                        <span className="font-semibold text-gray-300">Type:</span> {optimization.methodology.type}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-300">Description:</span> {optimization.methodology.description}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-300">Data Sources:</span>
                        <ul className="ml-4 mt-1">
                          {Object.entries(optimization.methodology.data_sources).map(([key, value]) => (
                            <li key={key}>• {key}: {value}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-yellow-400 mt-2">
                        ⚠️ {optimization.methodology.limitations}
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* Combined Context Score Card */}
          {predictions?.context_score && (
            <div className={`bg-gradient-to-r ${
              predictions.context_score.rating_color === 'green' ? 'from-green-900 to-emerald-900 border-green-500' :
              predictions.context_score.rating_color === 'lime' ? 'from-lime-900 to-green-900 border-lime-500' :
              predictions.context_score.rating_color === 'yellow' ? 'from-yellow-900 to-amber-900 border-yellow-500' :
              predictions.context_score.rating_color === 'orange' ? 'from-orange-900 to-red-900 border-orange-500' :
              'from-red-900 to-pink-900 border-red-500'
            } rounded-2xl p-6 shadow-2xl border-2`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-3xl font-bold text-white mb-1">
                    {predictions.context_score.rating_emoji} Context Score: {predictions.context_score.score}/100
                  </h3>
                  <div className="text-xl font-semibold text-gray-200">
                    {predictions.context_score.rating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-6xl">{predictions.context_score.rating_emoji}</div>
                </div>
              </div>
              
              {/* Score Bar */}
              <div className="mb-4">
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
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
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0 (Worst)</span>
                  <span>50 (Average)</span>
                  <span>100 (Best)</span>
                </div>
              </div>
              
              {/* Message */}
              <div className="bg-white bg-opacity-10 rounded-lg p-3 mb-4">
                <p className="text-sm text-white font-medium">
                  {predictions.context_score.message}
                </p>
              </div>
              
              {/* Contributing Factors */}
              {predictions.context_score.factors.length > 0 && (
                <div className="bg-gray-800 bg-opacity-40 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-200 mb-2">Contributing Factors:</h4>
                  <ul className="space-y-1">
                    {predictions.context_score.factors.map((factor, i) => (
                      <li key={i} className="text-xs text-gray-300">{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Breakdown */}
              {predictions.context_score.breakdown && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(predictions.context_score.breakdown).map(([key, value]) => 
                    value !== null && (
                      <div key={key} className="bg-gray-800 bg-opacity-40 rounded px-2 py-1">
                        <span className="text-gray-400 capitalize">{key}:</span>
                        <span className="text-white font-semibold ml-1">{value}</span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Traffic Context Card (for Transport) */}
          {predictions?.traffic_context && predictions.traffic_context.success && (
            <div className="bg-gradient-to-r from-orange-900 to-red-900 rounded-2xl p-6 shadow-2xl border-2 border-orange-500">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Car className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Traffic Impact: {predictions.traffic_context.condition}
                    </h3>
                    <div className="text-sm text-gray-300">
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
              
              <div className="grid grid-cols-3 gap-4 bg-gray-800 bg-opacity-40 rounded-xl p-4">
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <Navigation className="w-4 h-4" />
                    Delay Factor
                  </div>
                  <div className="text-3xl font-bold text-orange-400">
                    {predictions.traffic_context.delay_factor}x
                  </div>
                  <div className="text-xs text-gray-400">
                    +{predictions.traffic_context.delay_minutes.toFixed(0)} min delay
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Emission Impact
                  </div>
                  <div className="text-3xl font-bold text-red-400">
                    +{((predictions.traffic_context.emission_multiplier - 1) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400">
                    {predictions.traffic_context.emission_multiplier}x multiplier
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    Travel Time
                  </div>
                  <div className="text-3xl font-bold text-yellow-400">
                    {predictions.traffic_context.travel_time_minutes.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-400">
                    vs {predictions.traffic_context.travel_time_no_traffic.toFixed(0)} min normal
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-orange-500 bg-opacity-20 rounded-lg border border-orange-400">
                <div className="text-sm text-orange-100">
                  {predictions.traffic_context.message}
                </div>
                {predictions.traffic_context.note && (
                  <div className="text-xs text-gray-300 mt-2">
                    ℹ️ {predictions.traffic_context.note}
                  </div>
                )}
              </div>
              
              <div className="mt-3 text-xs text-gray-400">
                Confidence: {predictions.traffic_context.confidence} • 
                Method: {predictions.traffic_context.method}
              </div>
            </div>
          )}
          
          {/* Weather Context Card */}
          {predictions?.weather_context && predictions.weather_context.success && (
            <div className="bg-gradient-to-r from-blue-900 to-cyan-900 rounded-2xl p-6 shadow-2xl border-2 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Cloud className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Weather Impact: {predictions.weather_context.location}
                    </h3>
                    <div className="text-sm text-gray-300">
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
              
              <div className="grid grid-cols-3 gap-4 bg-gray-800 bg-opacity-40 rounded-xl p-4">
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <Sun className="w-4 h-4" />
                    Temperature
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {predictions.weather_context.temperature}°C
                  </div>
                  <div className="text-xs text-gray-400">
                    Feels like {predictions.weather_context.feels_like}°C
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <Wind className="w-4 h-4" />
                    Wind Speed
                  </div>
                  <div className="text-3xl font-bold text-cyan-400">
                    {predictions.weather_context.wind_speed}
                  </div>
                  <div className="text-xs text-gray-400">m/s</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 flex items-center gap-1">
                    <Droplets className="w-4 h-4" />
                    Humidity
                  </div>
                  <div className="text-3xl font-bold text-blue-400">
                    {predictions.weather_context.humidity}%
                  </div>
                  <div className="text-xs text-gray-400">
                    {predictions.weather_context.clouds}% clouds
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-500 bg-opacity-20 rounded-lg border border-blue-400">
                <div className="text-sm font-semibold text-blue-200 mb-2">
                  {domain === 'energy' ? '⚡ Grid Impact' : '🚗 Fuel Efficiency Impact'}
                </div>
                {domain === 'energy' ? (
                  <>
                    <div className="text-sm text-gray-300">
                      Carbon Impact: {predictions.weather_context.impact.score > 0 ? '📈' : '📉'} 
                      {Math.abs(predictions.weather_context.impact.score)}% {predictions.weather_context.impact.score > 0 ? 'increase' : 'decrease'}
                    </div>
                    <div className="text-xs text-gray-300 mt-1">{predictions.weather_context.impact.message}</div>
                    {predictions.weather_context.impact.factors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {predictions.weather_context.impact.factors.map((factor, i) => (
                          <li key={i} className="text-xs text-gray-300">• {factor}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm text-gray-300">
                      {predictions.predictions?.context_aware?.adjustments?.weather_multiplier && (
                        <>
                          Fuel consumption: {((predictions.predictions.context_aware.adjustments.weather_multiplier - 1) * 100).toFixed(0) > 0 ? '+' : ''}
                          {((predictions.predictions.context_aware.adjustments.weather_multiplier - 1) * 100).toFixed(0)}% 
                          {predictions.weather_context.temperature < 10 ? ' (cold engine warmup)' : 
                           predictions.weather_context.temperature > 28 ? ' (AC usage)' : 
                           predictions.weather_context.condition === 'Rain' ? ' (wet roads)' : ''}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Live Grid Card - PROMINENT */}
          {predictions?.grid_context && (
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl border-2 border-green-500">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    Live Grid: {predictions.grid_context.location}
                  </h3>
                  <div className="text-sm text-gray-400">
                    {predictions.grid_context.source}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 bg-gray-700 bg-opacity-50 rounded-xl p-4">
                <div>
                  <div className="text-sm text-gray-300">Current Intensity</div>
                  <div className="text-4xl font-bold text-green-400">
                    {predictions.grid_context.intensity_gco2_kwh.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-400">gCO₂/kWh</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300">vs. Average</div>
                  <div className={`text-3xl font-bold ${predictions.grid_context.comparison?.difference_percent < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                    {predictions.grid_context.comparison?.difference_percent > 0 ? '+' : ''}
                    {predictions.grid_context.comparison?.difference_percent.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {predictions.grid_context.comparison?.message}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 text-xs text-gray-400 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Updated: {new Date(predictions.grid_context.timestamp).toLocaleString()}
              </div>
            </div>
          )}

          {/* Model Comparison */}
          {predictions?.predictions && (
            <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Model Predictions Comparison
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={modelComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#9ca3af"
                    style={{ fontSize: '12px', fontWeight: '600' }}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    label={{ value: 'CO₂ (kg)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }}
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} label={{ position: 'top', fill: '#fff', fontSize: 12, formatter: (value) => value.toFixed(2) }}>
                    {modelComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-3 mt-4">
                {Object.entries(predictions.predictions).map(([name, data]) => (
                  <div key={name} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                    <div className="text-xs text-gray-300 uppercase font-semibold">{name}</div>
                    <div className="text-xl font-bold mt-1" style={{ color: modelColors[name] || '#a855f7' }}>
                      {(data.mean || 0).toFixed(3)}
                    </div>
                    <div className="text-xs text-gray-400">kg CO₂</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncertainty Visualization */}
          {predictions?.predictions?.bayesian && (
            <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-purple-400" />
                Bayesian Uncertainty (95% CI)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={uncertaintyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 p-4 bg-purple-500 bg-opacity-10 border border-purple-500 rounded-lg">
                <p className="text-sm text-purple-200">
                  <strong>Confidence Interval:</strong> [{predictions.predictions.bayesian.ci_lower.toFixed(2)}, {predictions.predictions.bayesian.ci_upper.toFixed(2)}] kg CO₂
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Standard Deviation: {predictions.predictions.bayesian.std.toFixed(2)} kg
                </p>
              </div>
            </div>
          )}

          {/* SHAP Explainability Section */}
          {predictions?.explainability && Object.keys(predictions.explainability).length > 0 && (
            <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                AI Explainability - Why This Prediction?
              </h3>
              
              {Object.entries(predictions.explainability).map(([modelName, explainData]) => {
                if (explainData.error) return null;
                
                return (
                  <div key={modelName} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4" style={{ color: modelColors[modelName] }} />
                      <h4 className="text-lg font-semibold uppercase" style={{ color: modelColors[modelName] }}>
                        {modelName} Model Explanation
                      </h4>
                    </div>
                    
                    {/* Human-readable explanation */}
                    <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4 mb-3">
                      <p className="text-sm text-gray-300 leading-relaxed">
                        💡 {explainData.explanation}
                      </p>
                    </div>
                    
                    {/* Base value info */}
                    <div className="text-xs text-gray-400 mb-3">
                      Base prediction (average): {explainData.base_value?.toFixed(3)} kg CO₂ 
                      → Final: {explainData.prediction?.toFixed(3)} kg CO₂
                    </div>
                    
                    {/* Feature importance bars */}
                    <div className="space-y-2">
                      {explainData.feature_importance?.map((feature, idx) => {
                        const isPositive = feature.shap_value > 0;
                        const maxAbsValue = Math.max(...explainData.feature_importance.map(f => Math.abs(f.shap_value)));
                        const barWidth = (Math.abs(feature.shap_value) / maxAbsValue) * 100;
                        
                        return (
                          <div key={idx} className="bg-gray-700 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-300">
                                {feature.feature}
                                <span className="text-xs text-gray-500 ml-2">
                                  (value: {typeof feature.value === 'number' ? feature.value.toFixed(2) : feature.value})
                                </span>
                              </span>
                              <span className={`text-sm font-bold ${isPositive ? 'text-red-400' : 'text-green-400'}`}>
                                {isPositive ? '+' : ''}{feature.shap_value.toFixed(3)} kg
                              </span>
                            </div>
                            <div className="w-full bg-gray-600 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${isPositive ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Legend */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
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

          {/* History Chart */}
          {history.length > 0 && (
            <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4">Prediction History</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="timestamp" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="bayesian" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 bg-opacity-30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Dataset Size</div>
          <div className="text-2xl font-bold text-green-400">18K+ Trips</div>
        </div>
        <div className="bg-gray-800 bg-opacity-30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">ML Models</div>
          <div className="text-2xl font-bold text-blue-400">10 Trained</div>
        </div>
        <div className="bg-gray-800 bg-opacity-30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Status</div>
          <div className="text-2xl font-bold text-purple-400">✅ Production</div>
        </div>
      </div>
    </div>
  );
}