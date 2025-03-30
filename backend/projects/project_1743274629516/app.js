let operator;
let operand1 = '';
let operand2 = '';
let flag = false;
document.querySelectorAll('button').forEach(button => {
	button.addEventListener('click', () => {
		if (button.className === 'operator') {
			operator = button.id;
			flag = true;
			document.getElementById('result').value = '';
		} else if (button.id === 'equals') {
			operand2 = operand1;
			operand1 = eval(operand1 + operator + operand2);
			document.getElementById('result').value = operand1;
			flag = false;
		} else if (button.id === 'clear') {
			operand1 = '';
			document.getElementById('result').value = '';
		} else {
			if (flag) {
				document.getElementById('result').value += button.id;
				operand1 += button.id;
			} else {
				document.getElementById('result').value = button.id;
				operand1 = button.id;
			}
		}
	});
});