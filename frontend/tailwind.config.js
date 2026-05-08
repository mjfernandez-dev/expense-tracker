/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        electric: {
          DEFAULT: '#0EA5E9', // Electric Blue for positive amounts
        },
        amber: {
          DEFAULT: '#F59E0B', // Warm Amber for warnings
        },
        danger: {
          DEFAULT: '#EF4444', // Signal Red for expenses
        },
      },
    },
  },
  plugins: [],
}