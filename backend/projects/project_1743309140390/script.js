window.onload = function() {
    var count = 0;
    var counter = document.getElementById('count');
    setInterval(function() {
        count++;
        counter.innerText = count;
    }, 1000);
}