document.addEventListener('DOMContentLoaded', function() {
	var catImages = [
		'https://placekitten.com/500/500',
		'https://placekitten.com/500/600',
		'https://placekitten.com/500/700',
		'https://placekitten.com/500/800'
	];

	function loadRandomCat() {
		var img = document.getElementById('catImg');
		img.src = catImages[Math.floor(Math.random() * catImages.length)];
	}

	loadRandomCat();

	var btn = document.getElementById('newCat');
	btn.addEventListener('click', loadRandomCat);
});