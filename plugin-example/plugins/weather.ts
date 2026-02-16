import { renderText, type World } from 'blecsd';
import { definePlugin } from 'blecsd/core';
import { BOX_SINGLE, packColor, renderBox, type CellBuffer } from 'blecsd/utils';

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

export function getWeatherData(): WeatherData {
  return weatherData;
}

export function renderWeatherToBuffer(
  buffer: CellBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const cyan = packColor(0, 255, 255);
  const white = packColor(255, 255, 255);
  const black = packColor(0, 0, 0);

  // Draw box border
  renderBox(buffer, x, y, w, h, BOX_SINGLE, { fg: cyan, bg: black });

  // Draw title
  renderText(buffer, x + 2, y, ' Weather Data ', white, black);

  // Draw weather data
  renderText(buffer, x + 2, y + 2, `Temp: ${weatherData.temperature}°C`, white, black);
  renderText(buffer, x + 2, y + 3, `Humidity: ${weatherData.humidity}%`, white, black);
  renderText(buffer, x + 2, y + 4, weatherData.condition, white, black);
}
