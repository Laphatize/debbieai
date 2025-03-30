window.onload = function() {
    var features = ['Generates human-like text', 'Advanced language model', 'Built by OpenAI', '30000-word vocabulary', 'Trained on diverse internet text'];
    var featureList = document.getElementById('features');
    for (var i = 0; i < features.length; i++) {
        var listItem = document.createElement('li');
        listItem.textContent = features[i];
        featureList.appendChild(listItem);
    }
}