let buttons = Array.from(document.querySelectorAll('button'));
let result = document.querySelector('#result');
buttons.map( button => {
  button.addEventListener('click', (e) => {
    result.textContent += e.target.innerText;
  })
});
document.querySelector('#equals').addEventListener('click', () => {
  try {
    result.textContent = eval(result.textContent);
  } catch {
    result.textContent = 'Error';
  }
});