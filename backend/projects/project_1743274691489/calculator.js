function getNumbers(){
    let number1 = document.getElementById('number1').value;
    let number2 = document.getElementById('number2').value;
    return [number1, number2];
}

function add(){
    let numbers = getNumbers();
    let result = Number(numbers[0]) + Number(numbers[1]);
    document.getElementById('output').innerHTML = result;
}

function subtract(){
    let numbers = getNumbers();
    let result = Number(numbers[0]) - Number(numbers[1]);
    document.getElementById('output').innerHTML = result;
}

function multiply(){
    let numbers = getNumbers();
    let result = Number(numbers[0]) * Number(numbers[1]);
    document.getElementById('output').innerHTML = result;
}

function divide(){
    let numbers = getNumbers();
    let result = Number(numbers[0]) / Number(numbers[1]);
    document.getElementById('output').innerHTML = result;
}