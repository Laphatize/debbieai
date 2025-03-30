document.getElementById('nav-toggle').addEventListener('click', function() {
	this.classList.toggle('active');
	document.getElementById('nav-content').classList.toggle('hidden');
});