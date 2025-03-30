let currentInput = '';
let operator = '';
let firstNumber = '';

// handle number button presses
const numbers = document.querySelectorAll('[data-num]');
numbers.forEach(button => {
	button.addEventListener('click', () => {
		currentInput += button.innerText;
		document.getElementById('display').value = currentInput;
	});
});

// handle operator button presses
const operators = document.querySelectorAll('[data-op]');
operators.forEach(button => {
	button.addEventListener('click', () => {
		if(firstNumber === ''){
			firstNumber = currentInput;
			currentInput = '';
		}
		operator = button.innerText;
	});
});

// handle equal button
const equalButton = document.querySelector('[data-op="="]');
equalButton.addEventListener('click', () => {
	let result = eval(firstNumber + operator + currentInput);
	document.getElementById('display').value = result;
	firstNumber = '';
	currentInput = '';

});

// handle clear button
const clearButton = document.getElementById('clear');
clearButton.addEventListener('click', () => {
	document.getElementById('display').value = '';
	currentInput = '';
	operator = '';
	firstNumber = '';
});
