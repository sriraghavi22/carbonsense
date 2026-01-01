from .context_fetcher import ContextFetcher
import numpy as np

class EnhancedEmissionCalculator:
    def __init__(self):
        self.context = ContextFetcher()
    
    def transport_emissions_enhanced(self, distance_km: float, lat: float, lon: float, 
                                   timestamp: datetime, vehicle_type: str = "car") -> Dict:
        """DEFRA + real-time context adjustments."""
        base_factor = 0.19 if vehicle_type == "car" else 0.10  # kgCO2/km
        
        # Fetch real-time context
        ctx = self.context.get_full_context(lat, lon, timestamp)
        
        # Dynamic adjustments
        grid_factor = 1.0  # EV adjustment
        temp_factor = max(0.85, 1 - (ctx['temp_c'] - 20) * 0.01)  # Cold weather +15%
        precip_factor = 1 + (ctx['precip_mm'] * 0.05)  # Rain +5% per mm
        congestion_factor = 1.2 if ctx['urban'] else 1.0  # Urban traffic
        
        enhanced_emission = distance_km * base_factor * grid_factor * temp_factor * precip_factor * congestion_factor
        
        return {
            "base_emission_kg": distance_km * base_factor,
            "enhanced_emission_kg": enhanced_emission,
            "context": ctx,
            "factors": {
                "grid": grid_factor,
                "temp": temp_factor,
                "precip": precip_factor,
                "congestion": congestion_factor
            }
        }
    
    def energy_emissions_enhanced(self, kwh: float, lat: float, lon: float, timestamp: datetime) -> Dict:
        """Real grid intensity instead of static 400gCO2/kWh."""
        ctx = self.context.get_full_context(lat, lon, timestamp)
        real_grid = ctx['grid_g_per_kwh']
        
        emission_kg = (kwh * real_grid) / 1000
        
        return {
            "static_emission_kg": kwh * 0.4,  # 400gCO2/kWh
            "enhanced_emission_kg": emission_kg,
            "grid_intensity": real_grid,
            "context": ctx
        }
