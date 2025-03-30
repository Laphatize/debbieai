document.addEventListener('DOMContentLoaded', function() {
  // Add texts to the gallery
  for (var i = 1; i <= 10; i++) {
    var p = document.createElement('p');
    p.textContent = 'Text ' + i;
    p.addEventListener('click', function(e) {
      document.getElementById('modal-text').textContent = e.target.textContent;
      document.getElementById('modal').classList.remove('hidden');
    });
    document.getElementById('gallery').appendChild(p);
  }

  // Close the modal view when clicked
  document.getElementById('modal').addEventListener('click', function() {
    document.getElementById('modal').classList.add('hidden');
  });
});