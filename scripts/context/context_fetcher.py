import requests
from typing import Dict, Optional, Tuple
from datetime import datetime
import os
from pathlib import Path

class ContextFetcher:
    def __init__(self):
        self.api_keys = {
            'openweather': os.getenv('OPENWEATHER_API_KEY'),
            'electricitymaps': os.getenv('ELECTRICITYMAPS_TOKEN'),
        }
    
    def get_grid_intensity(self, lat: float, lon: float, timestamp: datetime) -> Optional[float]:
        """Real-time grid carbon intensity gCO2/kWh."""
        # Electricity Maps Free Tier API
        url = "https://api.electricitymaps.com/free/v2/forecast"
        headers = {"auth-token": self.api_keys['electricitymaps']}
        params = {
            "lat": lat,
            "lon": lon,
            "datetime": timestamp.isoformat()
        }
        
        try:
            resp = requests.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                data = resp.json()
                return data['forecasts'][0]['carbonIntensity']  # gCO2/kWh
        except:
            pass
        
        # Fallback: UK average
        return 400.0
    
    def get_weather(self, lat: float, lon: float, timestamp: datetime) -> Dict[str, float]:
        """Temperature, precipitation, conditions."""
        url = f"https://api.openweathermap.org/data/2.5/weather"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_keys['openweather'],
            "units": "metric"
        }
        
        try:
            resp = requests.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "temp_c": data['main']['temp'],
                    "precip_mm": data.get('rain', {}).get('1h', 0),
                    "wind_kmh": data['wind']['speed'] * 3.6,
                    "humidity": data['main']['humidity']
                }
        except:
            pass
        
        return {"temp_c": 15.0, "precip_mm": 0, "wind_kmh": 10, "humidity": 70}
    
    def get_osm_features(self, lat: float, lon: float) -> Dict[str, str]:
        """Road type, urban/rural from OpenStreetMap."""
        # Nominatim API (free, no key)
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": lat,
            "lon": lon,
            "format": "json",
            "addressdetails": 1
        }
        
        try:
            resp = requests.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                road = data['address'].get('road', 'unknown')
                road_type = data['address'].get('highway', 'unknown')
                return {"road": road, "road_type": road_type, "urban": "urban" in road.lower()}
        except:
            pass
        
        return {"road": "unknown", "road_type": "residential", "urban": True}
    
    def get_full_context(self, lat: float, lon: float, timestamp: datetime) -> Dict:
        """Complete context augmentation."""
        return {
            **self.get_weather(lat, lon, timestamp),
            "grid_g_per_kwh": self.get_grid_intensity(lat, lon, timestamp),
            **self.get_osm_features(lat, lon)
        }

# Test the service
if __name__ == "__main__":
    fetcher = ContextFetcher()
    context = fetcher.get_full_context(51.5074, -0.1278, datetime.now())  # London
    print("Real-time context:", context)
