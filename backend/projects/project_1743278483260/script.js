function calculateGPA() {
    let grade = document.getElementById('grade').value;
    let creditHours = document.getElementById('creditHours').value;
    let gpa = grade / creditHours;
    document.getElementById('result').textContent = 'Your GPA is ' + gpa.toFixed(2);
}