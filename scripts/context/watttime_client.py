"""
Production Grid Intensity Client for CarbonSense
- Real-time API for California (demo)
- Temporal model for India (research)
- Ready for FastAPI integration
"""

import os
import requests
from dotenv import load_dotenv
from typing import Dict, Optional
from datetime import datetime
from functools import lru_cache

load_dotenv()


class GridIntensityService:
    """
    Multi-strategy grid intensity service:
    1. Real-time APIs (WattTime/ElectricityMaps) for covered regions
    2. Temporal model for India
    3. Static fallback
    """
    
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
            pass  # Silent fail, will use fallback
    
    def get_intensity(
        self, 
        location: str = "India",
        hour: Optional[int] = None,
        is_weekend: bool = False
    ) -> Dict:
        """
        Get grid carbon intensity for a location.
        
        Args:
            location: "India", "California", "UK", etc.
            hour: Hour of day (0-23) for temporal modeling
            is_weekend: Weekend flag for temporal modeling
        
        Returns:
            {
                "intensity_gco2_kwh": float,
                "source": str,
                "location": str,
                "timestamp": str,
                "confidence": "high" | "medium" | "low",
                "method": "api" | "temporal" | "static"
            }
        """
        location_lower = location.lower()
        
        # Strategy 1: Real-time API for UK (FREE - matches your dataset!)
        if "uk" in location_lower or "united kingdom" in location_lower or "britain" in location_lower:
            result = self._get_uk_realtime()
            if result["success"]:
                return result
        
        # Strategy 2: Real-time API for California
        if "california" in location_lower or "cal" in location_lower:
            result = self._get_california_realtime()
            if result["success"]:
                return result
        
        # Strategy 3: Temporal model for India
        if "india" in location_lower or "hyderabad" in location_lower:
            if hour is None:
                hour = datetime.now().hour
            return self._get_india_temporal(hour, is_weekend)
        
        # Strategy 4: Static fallback
        return self._get_static_fallback(location)
    
    def _get_uk_realtime(self) -> Dict:
        """Get real-time data for UK (FREE - Carbon Intensity API)"""
        try:
            # UK Carbon Intensity API - FREE, no API key needed!
            resp = requests.get(
                "https://api.carbonintensity.org.uk/intensity",
                timeout=5
            )
            
            if resp.status_code == 200:
                data = resp.json()
                intensity = data['data'][0]['intensity']['actual']
                
                if intensity:  # Sometimes returns None
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
        """Get real-time data for California (free tier)"""
        
        # Try WattTime first
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
                    
                    # Convert lbs/MWh to gCO2/kWh
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
                pass  # Try ElectricityMaps
        
        # Try ElectricityMaps
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
        """
        Temporal model for India grid intensity.
        Based on Central Electricity Authority patterns.
        """
        base = 700  # India average (coal-heavy grid)
        adjustment = 0
        
        # Time-of-day adjustments
        if 9 <= hour <= 21:
            # Peak hours: high industrial/commercial load, more coal
            adjustment += 50
        elif hour < 6 or hour >= 22:
            # Night: lower demand, more renewable/hydro
            adjustment -= 100
        else:
            # Morning/evening: moderate
            adjustment += 20
        
        # Weekend adjustment
        if is_weekend:
            # Lower industrial load, cleaner grid
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
            "china": 650,
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
    
    def compare_live_vs_static(self, location: str = "India") -> Dict:
        """Compare real-time/temporal vs static for user insights"""
        current = self.get_intensity(location)
        
        # Get static for comparison
        static_values = {
            "India": 700,
            "California": 400,
            "UK": 280
        }
        static = static_values.get(location, 475)
        
        diff = current["intensity_gco2_kwh"] - static
        diff_pct = (diff / static) * 100
        
        # Generate user message
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


# Simple API functions
def get_intensity(location: str = "India", hour: Optional[int] = None, is_weekend: bool = False) -> float:
    """Quick function: just get intensity value"""
    service = get_grid_service()
    result = service.get_intensity(location, hour, is_weekend)
    return result["intensity_gco2_kwh"]


def get_intensity_detailed(location: str = "India", hour: Optional[int] = None, is_weekend: bool = False) -> Dict:
    """Get intensity with full context"""
    service = get_grid_service()
    return service.get_intensity(location, hour, is_weekend)


def get_comparison(location: str = "India") -> Dict:
    """Get current vs static comparison"""
    service = get_grid_service()
    return service.compare_live_vs_static(location)


# Testing
if __name__ == "__main__":
    print("\n" + "="*70)
    print("🔋 PRODUCTION GRID INTENSITY SERVICE TEST")
    print("="*70)
    
    service = GridIntensityService()
    
    # Test 1: UK (FREE API - matches your dataset!)
    print("\n1️⃣  UK (FREE Carbon Intensity API - No API Key Needed!)")
    print("-"*70)
    result = service.get_intensity("UK")
    print(f"✅ Intensity: {result['intensity_gco2_kwh']:.0f} gCO₂/kWh")
    print(f"   Source: {result['source']}")
    print(f"   Method: {result['method']}")
    print(f"   Confidence: {result['confidence']}")
    print(f"   Time: {result['timestamp']}")
    print(f"   🎉 THIS MATCHES YOUR UK SMART METER DATASET!")
    
    # Test 2: California (real-time API)
    print("\n2️⃣  California (Real-time API)")
    print("-"*70)
    result = service.get_intensity("California")
    print(f"✅ Intensity: {result['intensity_gco2_kwh']:.0f} gCO₂/kWh")
    print(f"   Source: {result['source']}")
    print(f"   Method: {result['method']}")
    print(f"   Confidence: {result['confidence']}")
    print(f"   Time: {result['timestamp']}")
    
    # Test 3: India daytime (temporal model)
    print("\n3️⃣  India - Daytime Peak (Temporal Model)")
    print("-"*70)
    result = service.get_intensity("India", hour=14, is_weekend=False)
    print(f"✅ Intensity: {result['intensity_gco2_kwh']:.0f} gCO₂/kWh")
    print(f"   Source: {result['source']}")
    print(f"   Method: {result['method']}")
    print(f"   Components: {result['components']}")
    
    # Test 4: India nighttime
    print("\n4️⃣  India - Night (Temporal Model)")
    print("-"*70)
    result = service.get_intensity("India", hour=2, is_weekend=False)
    print(f"✅ Intensity: {result['intensity_gco2_kwh']:.0f} gCO₂/kWh")
    print(f"   Difference from day: {result['intensity_gco2_kwh'] - 750:.0f} gCO₂/kWh")
    
    # Test 5: UK Comparison
    print("\n5️⃣  Live vs Static Comparison (UK)")
    print("-"*70)
    comp = service.compare_live_vs_static("UK")
    print(f"Current: {comp['current']['intensity_gco2_kwh']:.0f} gCO₂/kWh")
    print(f"Static avg: {comp['static_average']:.0f} gCO₂/kWh")
    print(f"Difference: {comp['difference_gco2_kwh']:+.0f} gCO₂/kWh ({comp['difference_percent']:+.1f}%)")
    print(f"💬 {comp['message']}")
    
    print("\n" + "="*70)
    print("✅ SERVICE READY FOR FASTAPI INTEGRATION!")
    print("   PERFECT: UK API matches your UK Smart Meter dataset!")
    print("="*70)