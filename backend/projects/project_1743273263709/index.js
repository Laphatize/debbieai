// Your code here

// New changes:
let display = document.querySelector('.display');
let digits = document.querySelectorAll('.digit');
let operations = document.querySelectorAll('.operation');
let equal = document.querySelector('.equal');
digits.forEach(button => { button.addEventListener('click', () => { display.value += button.innerText; }); });
operations.forEach(button => { button.addEventListener('click', () => { display.value += ' ' + button.innerText + ' '; }); });
equal.addEventListener('click', () => { display.value = eval(display.value); });