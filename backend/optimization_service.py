"""
Temporal Optimization Service
Recommends best times for activities to minimize emissions
"""

from typing import Dict, List, Tuple
from datetime import datetime, timedelta
import math


class OptimizationService:
    """Recommend optimal timing for activities"""
    
    def __init__(self, grid_service, traffic_service):
        self.grid_service = grid_service
        self.traffic_service = traffic_service
    
    def get_optimal_times(
        self,
        domain: str,
        location: str,
        distance_km: float = None,
        kwh: float = None,
        vehicle_type: str = "petrol_car"
    ) -> Dict:
        """Find best times in next 24 hours - DYNAMIC VERSION"""
        
        # Get CURRENT real-time data as baseline
        current_grid = None
        current_traffic = None
        
        if domain == "energy":
            try:
                current_grid = self.grid_service.get_intensity(
                    location=location,
                    hour=datetime.now().hour,
                    is_weekend=datetime.now().weekday() >= 5
                )
            except:
                pass
        
        if domain == "transport":
            try:
                # Get current traffic
                coords = self.traffic_service.get_location_coords(location)
                lat_offset = (distance_km or 10.0) / 111.0
                current_traffic = self.traffic_service.get_traffic_impact(
                    distance_km=distance_km or 10.0,
                    location=location,
                    start_coords=coords,
                    end_coords=(coords[0] + lat_offset, coords[1])
                )
            except:
                pass
        
        current_hour = datetime.now().hour
        recommendations = []
        
        # Forecast next 24 hours using REAL CURRENT DATA + PATTERNS
        for hour_offset in range(24):
            future_hour = (current_hour + hour_offset) % 24
            future_time = datetime.now() + timedelta(hours=hour_offset)
            future_day = future_time.weekday()
            is_weekend = future_day >= 5
            
            if domain == "energy":
                # Use REAL current grid as baseline
                baseline_intensity = current_grid["intensity_gco2_kwh"] if current_grid else 400
                
                # Apply time-based adjustment from current
                predicted_intensity = self._forecast_grid_intensity(
                    baseline=baseline_intensity,
                    current_hour=current_hour,
                    future_hour=future_hour,
                    location=location,
                    is_weekend=is_weekend
                )
                
                emissions = (kwh or 1.0) * predicted_intensity / 1000
                confidence = "high" if current_grid and hour_offset < 6 else "medium" if hour_offset < 12 else "low"
                
                recommendations.append({
                    "time": future_time.strftime("%I:%M %p"),
                    "datetime": future_time.isoformat(),
                    "hour": future_hour,
                    "day": future_time.strftime("%a"),
                    "estimated_emissions": round(emissions, 3),
                    "grid_intensity": round(predicted_intensity, 1),
                    "confidence": confidence,
                    "forecast_method": "real_baseline_plus_patterns",
                    "savings_percent": 0
                })
            
            elif domain == "transport":
                # Use REAL current traffic as baseline
                baseline_multiplier = current_traffic.get("emission_multiplier", 1.0) if current_traffic else 1.0
                
                # Forecast traffic from current conditions
                predicted_multiplier = self._forecast_traffic_multiplier(
                    baseline=baseline_multiplier,
                    current_hour=current_hour,
                    future_hour=future_hour,
                    is_weekend=is_weekend
                )
                
                vehicle_factors = {
                    "petrol_car": 0.170, "diesel_car": 0.165, "hybrid": 0.110,
                    "electric": 0.053, "motorcycle": 0.113, "bus": 0.089,
                    "train": 0.041, "bicycle": 0.000, "walking": 0.000
                }
                
                base_factor = vehicle_factors.get(vehicle_type, 0.170)
                emissions = (distance_km or 10.0) * base_factor * predicted_multiplier
                confidence = "high" if current_traffic and hour_offset < 4 else "medium" if hour_offset < 8 else "low"
                
                recommendations.append({
                    "time": future_time.strftime("%I:%M %p"),
                    "datetime": future_time.isoformat(),
                    "hour": future_hour,
                    "day": future_time.strftime("%a"),
                    "estimated_emissions": round(emissions, 3),
                    "traffic_factor": round(predicted_multiplier, 2),
                    "confidence": confidence,
                    "forecast_method": "real_baseline_plus_patterns",
                    "savings_percent": 0
                })
        
        
        # Sort by emissions (best first)
        recommendations.sort(key=lambda x: x["estimated_emissions"])
        
        # Calculate savings percentages
        worst_emissions = recommendations[-1]["estimated_emissions"]
        best_emissions = recommendations[0]["estimated_emissions"]
        
        for rec in recommendations:
            if worst_emissions > 0:
                rec["savings_percent"] = round(
                    ((worst_emissions - rec["estimated_emissions"]) / worst_emissions) * 100, 1
                )
        
        # Find current time in recommendations
        current_time_rec = None
        for rec in recommendations:
            if rec["hour"] == current_hour:
                current_time_rec = rec
                break
        
        # Get top 5 best and worst 3 times
        best_times = recommendations[:5]
        worst_times = recommendations[-3:]
        
        # Calculate potential savings
        if current_time_rec:
            potential_savings = current_time_rec["estimated_emissions"] - best_times[0]["estimated_emissions"]
            potential_savings_percent = current_time_rec["savings_percent"]
        else:
            potential_savings = 0
            potential_savings_percent = 0
        
        return {
            "current_time": current_time_rec,
            "best_times": best_times,
            "worst_times": worst_times,
            "optimal_time": best_times[0],
            "potential_savings": {
                "absolute_kg": round(potential_savings, 3),
                "percent": round(potential_savings_percent, 1)
            },
            "recommendation": self._generate_recommendation(
                best_times[0], 
                current_time_rec, 
                domain,
                potential_savings_percent
            ),
            "insights": self._generate_insights(recommendations, domain),
            "methodology": {
            "type": "hybrid_forecast",
            "description": "Uses current real-time data as baseline, applies validated time-based patterns",
            "data_sources": {
                "current_baseline": "Real-time API data" if (current_grid or current_traffic) else "Historical average",
                "patterns": "Empirical time-of-day patterns from historical data",
                "confidence_decay": "High (0-6h), Medium (6-12h), Low (12-24h)"
            },
            "limitations": "Does not account for unpredictable events (weather changes, accidents, grid outages)"
        }
    }
    
    def _predict_grid_intensity(self, location: str, hour: int, is_weekend: bool) -> float:
        """Predict grid intensity for a future time"""
        
        # Base intensities by location
        base_intensity = {
            "UK": 280,
            "California": 400,
            "India": 700
        }.get(location, 400)
        
        # Time-based adjustments (solar/wind patterns)
        if 10 <= hour <= 16:  # Midday (solar peak)
            adjustment = -60
        elif 18 <= hour <= 21:  # Evening peak
            adjustment = +100
        elif 22 <= hour <= 5:  # Night (wind power, low demand)
            adjustment = -40
        elif 6 <= hour <= 9:  # Morning ramp-up
            adjustment = +30
        else:
            adjustment = 0
        
        # Weekend adjustment (lower demand)
        if is_weekend:
            adjustment -= 30
        
        return max(50, base_intensity + adjustment)
    
    def _predict_traffic_multiplier(self, hour: int, is_weekend: bool) -> float:
        """Predict traffic multiplier for future time"""
        
        if is_weekend:
            if 10 <= hour <= 16:
                return 1.3  # Weekend shopping/activities
            elif 18 <= hour <= 20:
                return 1.2  # Weekend evening
            return 1.0
        
        # Weekday patterns
        if 7 <= hour <= 9:
            return 1.8  # Morning rush hour
        elif 17 <= hour <= 19:
            return 1.9  # Evening rush hour (worse)
        elif 12 <= hour <= 14:
            return 1.3  # Lunch time
        elif 9 <= hour <= 17:
            return 1.2  # Business hours
        elif 22 <= hour or hour <= 5:
            return 1.0  # Night - free flow
        else:
            return 1.1  # Off-peak
    
    def _predict_energy_emissions(
        self,
        location: str,
        hour: int,
        is_weekend: bool,
        kwh: float
    ) -> float:
        """Predict energy emissions for a future time"""
        
        grid_intensity = self._predict_grid_intensity(location, hour, is_weekend)
        emissions_kg = (kwh * grid_intensity) / 1000
        return emissions_kg
    
    def _predict_transport_emissions(
        self,
        location: str,
        hour: int,
        is_weekend: bool,
        distance_km: float,
        vehicle_type: str
    ) -> float:
        """Predict transport emissions for a future time"""
        
        # Vehicle emission factors
        vehicle_factors = {
            "petrol_car": 0.170,
            "diesel_car": 0.165,
            "hybrid": 0.110,
            "electric": 0.053,
            "motorcycle": 0.113,
            "bus": 0.089,
            "train": 0.041,
            "bicycle": 0.000,
            "walking": 0.000
        }
        
        base_factor = vehicle_factors.get(vehicle_type, 0.170)
        traffic_multiplier = self._predict_traffic_multiplier(hour, is_weekend)
        
        emissions_kg = distance_km * base_factor * traffic_multiplier
        return emissions_kg
    
    def _generate_recommendation(
        self,
        best_time: Dict,
        current: Dict,
        domain: str,
        potential_savings: float
    ) -> str:
        """Generate human-readable recommendation"""
        
        if not current:
            return f"⏰ Optimal time: {best_time['time']} ({best_time['day']})"
        
        if best_time["hour"] == current["hour"]:
            if domain == "energy":
                return "✅ Great timing! This is one of the best times to use energy. Grid is relatively clean right now."
            else:
                return "✅ Great timing! Traffic conditions are favorable right now for your trip."
        
        if potential_savings < 5:
            return f"🟢 Current timing is good. Only {potential_savings:.0f}% potential improvement."
        elif potential_savings < 15:
            return f"💡 Consider {best_time['time']} ({best_time['day']}) for {potential_savings:.0f}% lower emissions."
        else:
            if domain == "energy":
                return f"⚡ Significant savings available! Charging at {best_time['time']} ({best_time['day']}) could reduce emissions by {potential_savings:.0f}%. Grid will be {self._get_time_description(best_time['hour'], domain)}."
            else:
                return f"🚗 Major savings possible! Traveling at {best_time['time']} ({best_time['day']}) could reduce emissions by {potential_savings:.0f}%. {self._get_time_description(best_time['hour'], domain)}."
    
    def _get_time_description(self, hour: int, domain: str) -> str:
        """Get description of conditions at that time"""
        
        if domain == "energy":
            if 10 <= hour <= 16:
                return "cleaner (solar generation peak)"
            elif 22 <= hour <= 5:
                return "cleaner (low demand, wind power)"
            elif 18 <= hour <= 21:
                return "at evening peak (avoid if possible)"
            else:
                return "at moderate intensity"
        else:  # transport
            if 7 <= hour <= 9 or 17 <= hour <= 19:
                return "Rush hour conditions"
            elif 22 <= hour or hour <= 5:
                return "Clear roads, minimal traffic"
            elif 12 <= hour <= 14:
                return "Moderate lunch-time traffic"
            else:
                return "Light to moderate traffic"
    
    def _generate_insights(self, recommendations: List[Dict], domain: str) -> List[str]:
        """Generate insights from the recommendations"""
        
        insights = []
        
        # Find best time windows
        if domain == "energy":
            best_window_start = None
            best_window_end = None
            in_good_window = False
            
            for rec in recommendations:
                if rec["estimated_emissions"] <= recommendations[0]["estimated_emissions"] * 1.1:
                    if not in_good_window:
                        best_window_start = rec["time"]
                        in_good_window = True
                    best_window_end = rec["time"]
                else:
                    in_good_window = False
            
            if best_window_start:
                insights.append(f"📅 Best window: {best_window_start} - {best_window_end}")
            
            # Weekend vs weekday
            weekend_avg = sum(r["estimated_emissions"] for r in recommendations if "Sat" in r["day"] or "Sun" in r["day"]) / max(1, sum(1 for r in recommendations if "Sat" in r["day"] or "Sun" in r["day"]))
            weekday_avg = sum(r["estimated_emissions"] for r in recommendations if "Sat" not in r["day"] and "Sun" not in r["day"]) / max(1, sum(1 for r in recommendations if "Sat" not in r["day"] and "Sun" not in r["day"]))
            
            if weekend_avg < weekday_avg * 0.9:
                diff_pct = ((weekday_avg - weekend_avg) / weekday_avg) * 100
                insights.append(f"📊 Weekend charging is {diff_pct:.0f}% cleaner on average")
            
            # Night vs day
            night_avg = sum(r["estimated_emissions"] for r in recommendations if r["hour"] >= 22 or r["hour"] <= 5) / max(1, sum(1 for r in recommendations if r["hour"] >= 22 or r["hour"] <= 5))
            day_avg = sum(r["estimated_emissions"] for r in recommendations if 9 <= r["hour"] <= 17) / max(1, sum(1 for r in recommendations if 9 <= r["hour"] <= 17))
            
            if night_avg < day_avg * 0.85:
                insights.append(f"🌙 Night charging (10pm-6am) reduces emissions significantly")
            elif day_avg < night_avg * 0.85:
                insights.append(f"☀️ Daytime charging (9am-5pm) is cleaner due to solar generation")
        
        else:  # transport
            # Rush hour vs off-peak
            rush_hour_emissions = [r["estimated_emissions"] for r in recommendations if r["hour"] in [7, 8, 17, 18, 19]]
            off_peak_emissions = [r["estimated_emissions"] for r in recommendations if r["hour"] in [22, 23, 0, 1, 2, 3, 4, 5]]
            
            if rush_hour_emissions and off_peak_emissions:
                rush_avg = sum(rush_hour_emissions) / len(rush_hour_emissions)
                off_peak_avg = sum(off_peak_emissions) / len(off_peak_emissions)
                diff_pct = ((rush_avg - off_peak_avg) / rush_avg) * 100
                
                if diff_pct > 30:
                    insights.append(f"⚠️ Rush hour adds {diff_pct:.0f}% more emissions due to traffic")
            
            # Best travel window
            insights.append(f"🚗 Optimal travel window: 10pm - 6am (minimal traffic)")
            
            # Midday option
            midday_avg = sum(r["estimated_emissions"] for r in recommendations if 10 <= r["hour"] <= 15) / max(1, sum(1 for r in recommendations if 10 <= r["hour"] <= 15))
            if midday_avg <= recommendations[0]["estimated_emissions"] * 1.15:
                insights.append(f"🌤️ Midday (10am-3pm) is also a good option")
        
        return insights
    
    def _forecast_grid_intensity(
        self,
        baseline: float,
        current_hour: int,
        future_hour: int,
        location: str,
        is_weekend: bool
    ) -> float:
        """
        Forecast grid intensity using REAL current baseline + time patterns
        
        Justification: Grid follows predictable diurnal patterns
        - Solar peaks midday (10am-4pm): -20% to -30%
        - Evening peak (6pm-9pm): +25% to +40%  
        - Night trough (10pm-6am): -15% to -25%
        
        Source: UK National Grid ESO, CAISO, IEA data
        """
        
        # Time-based adjustment from current conditions
        adjustment_factor = 1.0
        
        # Solar generation effect (daytime reduction)
        if 10 <= future_hour <= 16:
            adjustment_factor -= 0.25  # -25% for solar peak
        
        # Evening peak (demand surge)
        elif 18 <= future_hour <= 21:
            adjustment_factor += 0.35  # +35% for evening peak
        
        # Night trough (low demand + wind)
        elif 22 <= future_hour or future_hour <= 5:
            adjustment_factor -= 0.20  # -20% for night
        
        # Morning ramp-up
        elif 6 <= future_hour <= 9:
            adjustment_factor += 0.15  # +15% morning surge
        
        # Weekend effect (lower industrial demand)
        if is_weekend:
            adjustment_factor -= 0.10  # -10% on weekends
        
        # Apply adjustment to real baseline
        forecasted = baseline * adjustment_factor
        
        # Bounds checking (grids don't go below ~50 or above ~900)
        return max(50, min(900, forecasted))

    def _forecast_traffic_multiplier(
        self,
        baseline: float,
        current_hour: int,
        future_hour: int,
        is_weekend: bool
    ) -> float:
        """
        Forecast traffic using REAL current baseline + time patterns
        
        Justification: Traffic follows strong diurnal patterns
        - Rush hours (7-9am, 5-7pm): 1.7-2.0x normal
        - Midday: 1.2-1.4x normal
        - Night: 1.0x (free flow)
        
        Source: INRIX Global Traffic Scorecard, TomTom Traffic Index
        """
        
        # Predict multiplier for future hour
        if is_weekend:
            if 10 <= future_hour <= 16:
                target_multiplier = 1.3
            elif 18 <= future_hour <= 20:
                target_multiplier = 1.2
            else:
                target_multiplier = 1.0
        else:
            if 7 <= future_hour <= 9:
                target_multiplier = 1.8  # Morning rush
            elif 17 <= future_hour <= 19:
                target_multiplier = 1.9  # Evening rush (worse)
            elif 12 <= future_hour <= 14:
                target_multiplier = 1.3  # Lunch
            elif 9 <= future_hour <= 17:
                target_multiplier = 1.2  # Business hours
            elif 22 <= future_hour or future_hour <= 5:
                target_multiplier = 1.0  # Night
            else:
                target_multiplier = 1.1  # Off-peak
        
        # Blend current baseline with predicted pattern
        # Near-term: trust current more, far-term: trust pattern more
        hours_ahead = (future_hour - current_hour) % 24
        
        if hours_ahead <= 2:
            # Very near term: 80% current, 20% pattern
            forecasted = 0.8 * baseline + 0.2 * target_multiplier
        elif hours_ahead <= 6:
            # Near term: 50% current, 50% pattern
            forecasted = 0.5 * baseline + 0.5 * target_multiplier
        else:
            # Far term: 20% current, 80% pattern
            forecasted = 0.2 * baseline + 0.8 * target_multiplier
        
        return max(1.0, forecasted)


# Singleton
_optimization_service = None

def get_optimization_service(grid_service, traffic_service):
    global _optimization_service
    if _optimization_service is None:
        _optimization_service = OptimizationService(grid_service, traffic_service)
    return _optimization_service