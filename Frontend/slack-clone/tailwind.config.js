/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Slack-inspired palette
        sidebar: {
          bg:     '#3F0E40',
          hover:  '#521153',
          active: '#1164A3',
          text:   '#CFC3CF',
          heading:'#FFFFFF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          raised:  '#F8F8F8',
          overlay: '#1D1C1D',
        },
      },
      fontFamily: {
        sans: [
          'Lato',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
