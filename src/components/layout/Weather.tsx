import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudDrizzle, Loader2, CloudFog } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { logger } from '../../services/logger';
import { format } from 'date-fns';

interface WeatherData {
  temp: number;
  condition: string;
  icon: any;
  location: string;
  colorClass: string;
}

export default function Weather() {
  const { settings } = useSettings();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Use browser geolocation
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });

        const { latitude, longitude } = position.coords;

        // Get location name via reverse geocoding (Open-Meteo or similar)
        const geoResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        );
        const geoData = await geoResponse.json();
        const locationName = geoData.address.city || geoData.address.town || geoData.address.village || 'Current Location';

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
        );
        const data = await response.json();

        const code = data.current_weather.weathercode;
        let icon = Sun;
        let condition = 'Clear';
        let colorClass = 'text-amber-500';

        if (code >= 1 && code <= 3) { icon = Cloud; condition = 'Cloudy'; colorClass = 'text-zinc-400 dark:text-zinc-300'; }
        else if (code >= 45 && code <= 48) { icon = CloudFog; condition = 'Foggy'; colorClass = 'text-zinc-400'; }
        else if (code >= 51 && code <= 55) { icon = CloudDrizzle; condition = 'Drizzle'; colorClass = 'text-blue-400'; }
        else if (code >= 56 && code <= 67) { icon = CloudRain; condition = 'Rainy'; colorClass = 'text-blue-500'; }
        else if (code >= 71 && code <= 77) { icon = CloudSnow; condition = 'Snowy'; colorClass = 'text-sky-300'; }
        else if (code >= 80 && code <= 82) { icon = CloudRain; condition = 'Showers'; colorClass = 'text-blue-500'; }
        else if (code >= 85 && code <= 86) { icon = CloudSnow; condition = 'Snow Showers'; colorClass = 'text-sky-300'; }
        else if (code >= 95) { icon = CloudRain; condition = 'Thunderstorm'; colorClass = 'text-purple-500'; }

        setWeather({
          temp: Math.round(data.current_weather.temperature),
          condition,
          icon,
          location: locationName,
          colorClass,
        });
      } catch (error) {
        logger.error('Weather fetch failed', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 300000); // Every 5 mins
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-full border border-zinc-100 dark:border-zinc-800">
      <span className="text-xs font-bold text-zinc-900 dark:text-white whitespace-nowrap">
        {format(new Date(), 'do MMM')}
      </span>
      <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
      <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
    </div>
  );

  const Icon = weather?.icon || Sun;
  const tempDisplay = weather ? `${weather.temp}°C` : '--°C';
  const locationDisplay = weather ? weather.location : 'London';
  const iconColor = weather?.colorClass || 'text-amber-500';

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-full border border-zinc-100 dark:border-zinc-800">
      <span className="text-xs font-bold text-zinc-900 dark:text-white whitespace-nowrap">
        {format(new Date(), 'do MMM')}
      </span>
      <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <div className="flex flex-col leading-none">
          <span className="text-[10px] font-bold text-zinc-900 dark:text-white">{tempDisplay}</span>
          <span className="text-[8px] text-zinc-400 uppercase font-bold tracking-wider">{locationDisplay}</span>
        </div>
      </div>
    </div>
  );
}
