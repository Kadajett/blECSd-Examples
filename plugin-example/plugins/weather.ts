import { definePlugin, writeRaw, type World } from 'blecsd';

interface WeatherData {
  temperature: number;
  humidity: number;
  condition: string;
}

const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Stormy', 'Foggy', 'Snowy'];

let weatherData: WeatherData = {
  temperature: 20,
  humidity: 50,
  condition: 'Sunny',
};

let intervalHandle: NodeJS.Timeout | null = null;

function generateWeather(): WeatherData {
  return {
    temperature: Math.round(Math.random() * 40 - 10), // -10 to 30°C
    humidity: Math.round(Math.random() * 100),
    condition: conditions[Math.floor(Math.random() * conditions.length)] ?? 'Unknown',
  };
}

export const weatherPlugin = definePlugin({
  name: 'weather',
  version: '1.0.0',

  init(world: World): World {
    weatherData = generateWeather();
    return world;
  },

  onActivate() {
    intervalHandle = setInterval(() => {
      weatherData = generateWeather();
    }, 3000);
  },

  onDeactivate() {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  },

  cleanup(world: World): World {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    return world;
  },
});

export function renderWeather(x: number, y: number): void {
  writeRaw(`\x1b[${y};${x}H\x1b[36m╔════════════════════════╗\x1b[0m`);
  writeRaw(`\x1b[${y + 1};${x}H\x1b[36m║\x1b[0m Weather Data         \x1b[36m║\x1b[0m`);
  writeRaw(`\x1b[${y + 2};${x}H\x1b[36m╠════════════════════════╣\x1b[0m`);
  writeRaw(`\x1b[${y + 3};${x}H\x1b[36m║\x1b[0m Temp: ${weatherData.temperature}°C        \x1b[36m║\x1b[0m`);
  writeRaw(`\x1b[${y + 4};${x}H\x1b[36m║\x1b[0m Humidity: ${weatherData.humidity}%       \x1b[36m║\x1b[0m`);
  writeRaw(`\x1b[${y + 5};${x}H\x1b[36m║\x1b[0m ${weatherData.condition.padEnd(20)} \x1b[36m║\x1b[0m`);
  writeRaw(`\x1b[${y + 6};${x}H\x1b[36m╚════════════════════════╝\x1b[0m`);
}
