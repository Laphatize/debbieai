var keys = document.querySelector('#keys');
var display = document.querySelector('#display');
var operator = null;
var operand1 = null;

keys.addEventListener('click', function(e) {
  var key = e.target;
  var action = key.className;
  var keyContent = key.textContent;
  var displayedNum = display.value;

if(action === 'number') {
    if(displayedNum === '0') {
      display.value = keyContent;
    } else {
      display.value = displayedNum + keyContent;
    }
  }

if(action === 'operator') {
    operator = key.value;
    operand1 = parseInt(display.value);
    display.value = '';
  }

if(key.id === 'equals') {
    var operand2 = parseInt(display.value);
    var result = eval(operand1 + ' ' + operator + ' ' + operand2);
    display.value = result;
  }

if(key.id === 'clear') {
    display.value = '';
    operator = null;
    operand1 = null;
  }
});