document.addEventListener('DOMContentLoaded', function() {
  // Add images to the gallery
  for (var i = 1; i <= 10; i++) {
    var img = document.createElement('img');
    img.src = 'https://via.placeholder.com/350';
    img.alt = 'Image ' + i;
    img.addEventListener('click', function(e) {
      document.getElementById('modal-img').src = e.target.src;
      document.getElementById('modal').classList.remove('hidden');
    });
    document.getElementById('gallery').appendChild(img);
  }

  // Close the modal view when clicked
  document.getElementById('modal').addEventListener('click', function() {
    document.getElementById('modal').classList.add('hidden');
  });
});