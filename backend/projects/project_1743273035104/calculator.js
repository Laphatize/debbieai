let display = document.querySelector('.display');
let buttons = Array.from(document.querySelectorAll('.button'));
buttons.map( button => {
	button.addEventListener('click', (e) => {
		display.value += e.target.innerText;
		if (e.target.innerText === '=') {
			display.value = eval(display.value);
		}
	});
});