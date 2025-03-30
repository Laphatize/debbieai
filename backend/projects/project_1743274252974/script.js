const display = document.getElementById('calc-display');
const clear = document.getElementById('calc-clear');
const equals = document.getElementById('calc-equals');
const digits = Array.from(document.querySelectorAll('[data-digit]'));
const operators = Array.from(document.querySelectorAll('[data-operator]'));
let firstValue = '';
let secondValue = '';
let currentOperator = null;

function appendDigit(digit) {
    if (currentOperator) {
        secondValue += digit;
    } else {
        firstValue += digit;
    }
    display.value = firstValue + ' ' + currentOperator + ' ' + secondValue;
}

function setOperator(operator) {
    currentOperator = operator;
    display.value = firstValue + ' ' + currentOperator;
}

function calculate() {
    let result;
    switch (currentOperator) {
        case '+': result = parseFloat(firstValue) + parseFloat(secondValue); break;
        case '-': result = parseFloat(firstValue) - parseFloat(secondValue); break;
        case '*': result = parseFloat(firstValue) * parseFloat(secondValue); break;
        case '/': result = parseFloat(firstValue) / parseFloat(secondValue); break;
    }
    clearAll();
    display.value = result;
}

function clearAll() {
    firstValue = '';
    secondValue = '';
    currentOperator = null;
}

clear.addEventListener('click', clearAll);
equals.addEventListener('click', calculate);
digits.forEach(button => button.addEventListener('click', () => appendDigit(button.textContent)));
operators.forEach(button => button.addEventListener('click', () => setOperator(button.textContent)));