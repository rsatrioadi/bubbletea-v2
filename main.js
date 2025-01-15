
import { initPaneResizer } from './ui/resizer.js';  // if you have a pane resizer
import { initFileUpload } from './ui/fileUpload.js'; // the module we just created

document.addEventListener('DOMContentLoaded', () => {
	initPaneResizer();
	initFileUpload();
});