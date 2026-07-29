import { argbFromHex, themeFromSourceColor, hexFromArgb } from '@material/material-color-utilities';

const theme = themeFromSourceColor(argbFromHex('#ff5722'));
console.log(theme.schemes.dark.toJSON());
