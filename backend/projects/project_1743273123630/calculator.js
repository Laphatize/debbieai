document.querySelector('.calculator').addEventListener('click', function(event) {
  if(event.target.matches('input')) {
    var btnValue = event.target.value;
    var display = document.querySelector('#result');

    if (btnValue === '=') {
      try {
        display.value = eval(display.value);
      } catch (e) {
        display.value = 'Error';
      }
    } else if(btnValue === 'C') {
      display.value = '';
    } else {
      display.value += btnValue;
    }
  }
});