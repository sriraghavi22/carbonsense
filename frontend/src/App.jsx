import { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Activity, Zap, AlertCircle, TrendingUp, Info } from 'lucide-react';

export default function CarbonSenseApp() {
  const [domain, setDomain] = useState('transport');
  const [formData, setFormData] = useState({
    distance_km: 5,
    kwh: 2,
    hour: 12,
    day_of_week: 3,
    is_weekend: 0,
    location: 'UK'
  });
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const modelColors = {
    linear: '#3b82f6',
    rf: '#10b981',
    xgb: '#f59e0b',
    bayesian: '#8b5cf6',
    context_aware: '#ec4899'
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
          
          {domain === 'energy' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">📍 Location (Grid)</label>
              <select
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
                className="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
              >
                <option value="UK">🇬🇧 United Kingdom</option>
                <option value="California">🇺🇸 California</option>
                <option value="India">🇮🇳 India</option>
              </select>
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
            className="w-full py-4 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg font-bold text-lg hover:from-green-600 hover:to-blue-600 transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Predicting...' : '🚀 Predict Emissions'}
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