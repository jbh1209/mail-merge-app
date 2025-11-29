// Top 25 most popular Google Fonts for label design
export const POPULAR_GOOGLE_FONTS = [
  { name: 'Arial', family: 'Arial, sans-serif' }, // System font - always available
  { name: 'Roboto', family: 'Roboto, sans-serif' },
  { name: 'Open Sans', family: 'Open Sans, sans-serif' },
  { name: 'Lato', family: 'Lato, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Oswald', family: 'Oswald, sans-serif' },
  { name: 'Raleway', family: 'Raleway, sans-serif' },
  { name: 'Poppins', family: 'Poppins, sans-serif' },
  { name: 'Merriweather', family: 'Merriweather, serif' },
  { name: 'Playfair Display', family: 'Playfair Display, serif' },
  { name: 'Nunito', family: 'Nunito, sans-serif' },
  { name: 'Ubuntu', family: 'Ubuntu, sans-serif' },
  { name: 'Rubik', family: 'Rubik, sans-serif' },
  { name: 'Work Sans', family: 'Work Sans, sans-serif' },
  { name: 'Source Sans Pro', family: 'Source Sans Pro, sans-serif' },
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Roboto Condensed', family: 'Roboto Condensed, sans-serif' },
  { name: 'PT Sans', family: 'PT Sans, sans-serif' },
  { name: 'Libre Baskerville', family: 'Libre Baskerville, serif' },
  { name: 'Crimson Text', family: 'Crimson Text, serif' },
  { name: 'Quicksand', family: 'Quicksand, sans-serif' },
  { name: 'Josefin Sans', family: 'Josefin Sans, sans-serif' },
  { name: 'Comfortaa', family: 'Comfortaa, sans-serif' },
  { name: 'Dancing Script', family: 'Dancing Script, cursive' },
  { name: 'Pacifico', family: 'Pacifico, cursive' },
  { name: 'Bebas Neue', family: 'Bebas Neue, sans-serif' },
];

// Generate Google Fonts URL for all non-system fonts
export const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=' + 
  POPULAR_GOOGLE_FONTS
    .filter(f => f.name !== 'Arial') // Skip system fonts
    .map(f => f.name.replace(/ /g, '+') + ':wght@400;700')
    .join('&family=') + 
  '&display=swap';
