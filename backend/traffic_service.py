"""
Traffic Service for CarbonSense
Provides real-time traffic data and emissions impact
"""

import os
import requests
from dotenv import load_dotenv
from typing import Dict, Optional, Tuple
from datetime import datetime
import math

load_dotenv()


class TrafficService:
    """Real-time traffic data service"""
    
    def __init__(self):
        self.tomtom_key = os.getenv("TOMTOM_API_KEY")
        self.google_key = os.getenv("GOOGLE_MAPS_API_KEY")
        self.here_key = os.getenv("HERE_API_KEY")
    
    def get_traffic_impact(
        self,
        distance_km: float,
        location: str = "UK",
        start_coords: Optional[Tuple[float, float]] = None,
        end_coords: Optional[Tuple[float, float]] = None
    ) -> Dict:
        """Get traffic impact on emissions"""
        
        # If coordinates provided, use real API
        if start_coords and end_coords:
            result = self._get_real_traffic(start_coords, end_coords, distance_km)
            if result["success"]:
                return result
        
        # Fallback: time-based traffic estimation
        return self._estimate_traffic_from_time(distance_km, location)
    
    def _get_real_traffic(
        self,
        start_coords: Tuple[float, float],
        end_coords: Tuple[float, float],
        distance_km: float
    ) -> Dict:
        """Get real traffic data from APIs"""
        
        # Try TomTom first (most reliable free option)
        if self.tomtom_key:
            result = self._get_tomtom_traffic(start_coords, end_coords, distance_km)
            if result["success"]:
                return result
        
        # Try Google Maps
        if self.google_key:
            result = self._get_google_traffic(start_coords, end_coords, distance_km)
            if result["success"]:
                return result
        
        return {"success": False}
    
    def _get_tomtom_traffic(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        distance_km: float
    ) -> Dict:
        """Get traffic from TomTom Routing API"""
        try:
            # Format: lat,lon:lat,lon
            route = f"{start[0]},{start[1]}:{end[0]},{end[1]}"
            
            resp = requests.get(
                f"https://api.tomtom.com/routing/1/calculateRoute/{route}/json",
                params={
                    "key": self.tomtom_key,
                    "traffic": "true",
                    "travelMode": "car",
                    "routeType": "fastest"
                },
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                
                if "routes" in data and len(data["routes"]) > 0:
                    route_data = data["routes"][0]["summary"]
                    
                    # Get travel times
                    travel_time_traffic = route_data["travelTimeInSeconds"] / 60  # minutes
                    travel_time_no_traffic = route_data.get("noTrafficTravelTimeInSeconds", travel_time_traffic) / 60
                    
                    # Calculate delay factor
                    delay_factor = travel_time_traffic / travel_time_no_traffic if travel_time_no_traffic > 0 else 1.0
                    delay_minutes = travel_time_traffic - travel_time_no_traffic
                    
                    # Calculate emissions multiplier
                    # Research shows: stop-and-go traffic increases fuel consumption by 40-100%
                    emission_multiplier = self._calculate_emission_multiplier(delay_factor)
                    
                    # Get actual distance from route
                    actual_distance_km = route_data["lengthInMeters"] / 1000
                    
                    return {
                        "success": True,
                        "source": "TomTom Traffic API",
                        "method": "real_time_api",
                        "delay_factor": round(delay_factor, 2),
                        "emission_multiplier": round(emission_multiplier, 2),
                        "travel_time_minutes": round(travel_time_traffic, 1),
                        "travel_time_no_traffic": round(travel_time_no_traffic, 1),
                        "delay_minutes": round(delay_minutes, 1),
                        "actual_distance_km": round(actual_distance_km, 2),
                        "condition": self._get_traffic_condition(delay_factor),
                        "message": self._get_traffic_message(delay_factor, emission_multiplier),
                        "confidence": "high"
                    }
            
            print(f"TomTom API error: Status {resp.status_code}")
            
        except Exception as e:
            print(f"TomTom API exception: {e}")
        
        return {"success": False}
    
    def _get_google_traffic(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        distance_km: float
    ) -> Dict:
        """Get traffic from Google Maps Directions API"""
        try:
            resp = requests.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params={
                    "origin": f"{start[0]},{start[1]}",
                    "destination": f"{end[0]},{end[1]}",
                    "departure_time": "now",
                    "traffic_model": "best_guess",
                    "key": self.google_key
                },
                timeout=10
            )
            
            if resp.status_code == 200:
                data = resp.json()
                
                if data["status"] == "OK" and len(data["routes"]) > 0:
                    leg = data["routes"][0]["legs"][0]
                    
                    # Get durations
                    duration_traffic = leg["duration_in_traffic"]["value"] / 60  # minutes
                    duration_normal = leg["duration"]["value"] / 60
                    
                    delay_factor = duration_traffic / duration_normal if duration_normal > 0 else 1.0
                    delay_minutes = duration_traffic - duration_normal
                    
                    emission_multiplier = self._calculate_emission_multiplier(delay_factor)
                    
                    actual_distance_km = leg["distance"]["value"] / 1000
                    
                    return {
                        "success": True,
                        "source": "Google Maps API",
                        "method": "real_time_api",
                        "delay_factor": round(delay_factor, 2),
                        "emission_multiplier": round(emission_multiplier, 2),
                        "travel_time_minutes": round(duration_traffic, 1),
                        "travel_time_no_traffic": round(duration_normal, 1),
                        "delay_minutes": round(delay_minutes, 1),
                        "actual_distance_km": round(actual_distance_km, 2),
                        "condition": self._get_traffic_condition(delay_factor),
                        "message": self._get_traffic_message(delay_factor, emission_multiplier),
                        "confidence": "high"
                    }
        
        except Exception as e:
            print(f"Google Maps API exception: {e}")
        
        return {"success": False}
    
    def _estimate_traffic_from_time(self, distance_km: float, location: str) -> Dict:
        """Estimate traffic based on time of day (fallback)"""
        
        now = datetime.now()
        hour = now.hour
        day_of_week = now.weekday()
        is_weekend = day_of_week >= 5
        
        # Traffic patterns by time
        if is_weekend:
            # Weekend patterns
            if 10 <= hour <= 16:
                delay_factor = 1.3
                condition = "Moderate Traffic"
            elif 18 <= hour <= 20:
                delay_factor = 1.2
                condition = "Light Traffic"
            else:
                delay_factor = 1.05
                condition = "Free Flow"
        else:
            # Weekday patterns
            if 7 <= hour <= 9:  # Morning rush
                delay_factor = 1.7
                condition = "Heavy Traffic"
            elif 17 <= hour <= 19:  # Evening rush
                delay_factor = 1.8
                condition = "Heavy Traffic"
            elif 12 <= hour <= 14:  # Lunch time
                delay_factor = 1.3
                condition = "Moderate Traffic"
            elif 9 <= hour <= 17:  # Business hours
                delay_factor = 1.2
                condition = "Light-Moderate Traffic"
            elif 22 <= hour or hour <= 5:  # Night
                delay_factor = 1.0
                condition = "Free Flow"
            else:
                delay_factor = 1.1
                condition = "Light Traffic"
        
        emission_multiplier = self._calculate_emission_multiplier(delay_factor)
        
        # Estimate travel time
        avg_speed_no_traffic = 60  # km/h
        avg_speed_traffic = avg_speed_no_traffic / delay_factor
        travel_time_no_traffic = (distance_km / avg_speed_no_traffic) * 60
        travel_time_traffic = (distance_km / avg_speed_traffic) * 60
        delay_minutes = travel_time_traffic - travel_time_no_traffic
        
        return {
            "success": True,
            "source": "Temporal Pattern Estimation",
            "method": "time_based_estimate",
            "delay_factor": round(delay_factor, 2),
            "emission_multiplier": round(emission_multiplier, 2),
            "travel_time_minutes": round(travel_time_traffic, 1),
            "travel_time_no_traffic": round(travel_time_no_traffic, 1),
            "delay_minutes": round(delay_minutes, 1),
            "actual_distance_km": distance_km,
            "condition": condition,
            "message": self._get_traffic_message(delay_factor, emission_multiplier),
            "confidence": "medium",
            "note": "Estimated based on typical traffic patterns. Add API key for real-time data."
        }
    
    def _calculate_emission_multiplier(self, delay_factor: float) -> float:
        """
        Calculate how much traffic increases emissions
        Based on research:
        - Stop-and-go traffic: +40-100% fuel consumption
        - Moderate congestion: +15-40%
        - Light traffic: +5-15%
        """
        if delay_factor >= 2.0:
            return 2.0  # Extreme congestion: +100%
        elif delay_factor >= 1.5:
            return 1.7  # Heavy traffic: +70%
        elif delay_factor >= 1.3:
            return 1.4  # Moderate traffic: +40%
        elif delay_factor >= 1.15:
            return 1.2  # Light traffic: +20%
        elif delay_factor >= 1.05:
            return 1.1  # Very light: +10%
        else:
            return 1.0  # Free flow
    
    def _get_traffic_condition(self, delay_factor: float) -> str:
        """Get human-readable traffic condition"""
        if delay_factor >= 2.0:
            return "Severe Congestion"
        elif delay_factor >= 1.5:
            return "Heavy Traffic"
        elif delay_factor >= 1.3:
            return "Moderate Traffic"
        elif delay_factor >= 1.15:
            return "Light Traffic"
        elif delay_factor >= 1.05:
            return "Mostly Clear"
        else:
            return "Free Flow"
    
    def _get_traffic_message(self, delay_factor: float, emission_multiplier: float) -> str:
        """Generate traffic impact message"""
        increase_pct = (emission_multiplier - 1.0) * 100
        
        if increase_pct >= 80:
            return f"🚨 Severe congestion adding {increase_pct:.0f}% to emissions. Consider alternate routes or delaying travel."
        elif increase_pct >= 50:
            return f"⚠️ Heavy traffic increasing emissions by {increase_pct:.0f}%. Alternate routes recommended."
        elif increase_pct >= 30:
            return f"⚠️ Moderate congestion adding {increase_pct:.0f}% to fuel consumption."
        elif increase_pct >= 15:
            return f"🟡 Light traffic impact: +{increase_pct:.0f}% emissions."
        elif increase_pct >= 5:
            return f"🟢 Minimal traffic delay: +{increase_pct:.0f}% emissions."
        else:
            return "✅ Clear roads - optimal conditions for fuel efficiency!"
    
    def get_location_coords(self, location: str) -> Tuple[float, float]:
        """Get default coordinates for major cities"""
        coords_map = {
            "uk": (51.5074, -0.1278),  # London
            "united kingdom": (51.5074, -0.1278),
            "london": (51.5074, -0.1278),
            "california": (37.7749, -122.4194),  # San Francisco
            "san francisco": (37.7749, -122.4194),
            "los angeles": (34.0522, -118.2437),
            "india": (28.6139, 77.2090),  # Delhi
            "delhi": (28.6139, 77.2090),
            "hyderabad": (17.3850, 78.4867),
            "mumbai": (19.0760, 72.8777),
            "bangalore": (12.9716, 77.5946)
        }
        return coords_map.get(location.lower(), (51.5074, -0.1278))


# Singleton
_traffic_service = None

def get_traffic_service() -> TrafficService:
    global _traffic_service
    if _traffic_service is None:
        _traffic_service = TrafficService()
    return _traffic_service