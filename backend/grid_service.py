"""
Production Grid Intensity Client for CarbonSense Backend
"""

import os
import requests
from dotenv import load_dotenv
from typing import Dict, Optional
from datetime import datetime

load_dotenv()


class GridIntensityService:
    """Multi-strategy grid intensity service"""
    
    def __init__(self):
        # API credentials
        wt_creds = os.getenv("WATTTIME_API_KEY", "")
        if ":" in wt_creds:
            self.wt_username, self.wt_password = wt_creds.split(":", 1)
        else:
            self.wt_username, self.wt_password = None, None
        
        self.em_key = os.getenv("ELECTRICITYMAPS_API_KEY")
        self.wt_token = None
        
        # Login to WattTime if credentials exist
        if self.wt_username:
            self._login_watttime()
    
    def _login_watttime(self):
        """Login to WattTime and cache token"""
        try:
            resp = requests.get(
                "https://api.watttime.org/login",
                auth=(self.wt_username, self.wt_password),
                timeout=5
            )
            if resp.status_code == 200:
                self.wt_token = resp.json()["token"]
        except:
            pass
    
    def get_intensity(
        self, 
        location: str = "UK",
        hour: Optional[int] = None,
        is_weekend: bool = False
    ) -> Dict:
        """Get grid carbon intensity for a location"""
        location_lower = location.lower()
        
        # Strategy 1: UK (FREE API)
        if "uk" in location_lower or "united kingdom" in location_lower or "britain" in location_lower:
            result = self._get_uk_realtime()
            if result["success"]:
                return result
        
        # Strategy 2: California
        if "california" in location_lower or "cal" in location_lower:
            result = self._get_california_realtime()
            if result["success"]:
                return result
        
        # Strategy 3: India temporal model
        if "india" in location_lower or "hyderabad" in location_lower:
            if hour is None:
                hour = datetime.now().hour
            return self._get_india_temporal(hour, is_weekend)
        
        return self._get_static_fallback(location)
    
    def _get_uk_realtime(self) -> Dict:
        """Get UK real-time data (FREE)"""
        try:
            resp = requests.get(
                "https://api.carbonintensity.org.uk/intensity",
                timeout=5
            )
            
            if resp.status_code == 200:
                data = resp.json()
                intensity = data['data'][0]['intensity']['actual']
                
                if intensity:
                    return {
                        "success": True,
                        "intensity_gco2_kwh": intensity,
                        "source": "UK Carbon Intensity API (Free)",
                        "location": "United Kingdom",
                        "timestamp": data['data'][0]['from'],
                        "confidence": "high",
                        "method": "api"
                    }
        except:
            pass
        
        return {"success": False}
    
    def _get_california_realtime(self) -> Dict:
        """Get California real-time data"""
        if self.wt_token:
            try:
                resp = requests.get(
                    "https://api.watttime.org/v3/forecast",
                    headers={"Authorization": f"Bearer {self.wt_token}"},
                    params={"region": "CAISO_NORTH", "signal_type": "co2_moer"},
                    timeout=5
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    current = data.get("data", [{}])[0]
                    lbs_per_mwh = current.get("value", 0)
                    gco2_kwh = lbs_per_mwh * 453.592 / 1000
                    
                    return {
                        "success": True,
                        "intensity_gco2_kwh": round(gco2_kwh, 1),
                        "source": "WattTime API",
                        "location": "California (CAISO_NORTH)",
                        "timestamp": current.get("point_time"),
                        "confidence": "high",
                        "method": "api"
                    }
            except:
                pass
        
        if self.em_key:
            try:
                resp = requests.get(
                    "https://api.electricitymap.org/v3/carbon-intensity/latest",
                    headers={"auth-token": self.em_key},
                    params={"zone": "US-CAL-CISO"},
                    timeout=5
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "success": True,
                        "intensity_gco2_kwh": data.get("carbonIntensity"),
                        "source": "ElectricityMaps API",
                        "location": "California",
                        "timestamp": data.get("datetime"),
                        "confidence": "high",
                        "method": "api"
                    }
            except:
                pass
        
        return {"success": False}
    
    def _get_india_temporal(self, hour: int, is_weekend: bool) -> Dict:
        """Temporal model for India"""
        base = 700
        adjustment = 0
        
        if 9 <= hour <= 21:
            adjustment += 50
        elif hour < 6 or hour >= 22:
            adjustment -= 100
        else:
            adjustment += 20
        
        if is_weekend:
            adjustment -= 30
        
        intensity = base + adjustment
        
        return {
            "success": True,
            "intensity_gco2_kwh": intensity,
            "source": "Temporal Model",
            "location": "India",
            "timestamp": datetime.now().isoformat(),
            "confidence": "medium",
            "method": "temporal",
            "components": {
                "base": base,
                "time_adjustment": adjustment,
                "hour": hour,
                "is_weekend": is_weekend
            }
        }
    
    def _get_static_fallback(self, location: str) -> Dict:
        """Static regional averages"""
        averages = {
            "india": 700,
            "us": 400,
            "uk": 280,
            "california": 400,
            "global": 475
        }
        
        intensity = averages.get(location.lower(), 475)
        
        return {
            "success": True,
            "intensity_gco2_kwh": intensity,
            "source": "Static Average",
            "location": location,
            "timestamp": datetime.now().isoformat(),
            "confidence": "low",
            "method": "static"
        }
    
    def compare_live_vs_static(self, location: str = "UK") -> Dict:
        """Compare real-time vs static"""
        current = self.get_intensity(location)
        
        static_values = {
            "UK": 280,
            "California": 400,
            "India": 700
        }
        static = static_values.get(location, 475)
        
        diff = current["intensity_gco2_kwh"] - static
        diff_pct = (diff / static) * 100
        
        if abs(diff_pct) < 5:
            message = f"Grid is near average ({static:.0f} gCO₂/kWh)"
        elif diff_pct < -10:
            message = f"Grid is {abs(diff_pct):.0f}% cleaner than usual! Great time for high-energy activities."
        elif diff_pct > 10:
            message = f"Grid is {diff_pct:.0f}% dirtier than usual. Consider delaying energy use if possible."
        else:
            message = f"Grid is {abs(diff_pct):.0f}% {'cleaner' if diff < 0 else 'dirtier'} than average."
        
        return {
            "current": current,
            "static_average": static,
            "difference_gco2_kwh": round(diff, 1),
            "difference_percent": round(diff_pct, 1),
            "is_cleaner": diff < 0,
            "message": message
        }


# Singleton instance
_service = None

def get_grid_service() -> GridIntensityService:
    """Get singleton service instance"""
    global _service
    if _service is None:
        _service = GridIntensityService()
    return _service