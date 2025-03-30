var left = document.getElementById('left');
var right = document.getElementById('right');
var output = document.getElementById('output');
var nums = ['7','8','9','4','5','6','1','2','3','0'];
var ops = ['+','-','*','/'];


for(var i=0; i<nums.length; i++){
    var button = document.createElement('button');
    button.textContent = nums[i];
    button.className = 'button';
    button.addEventListener('click',function(e){
        output.textContent += e.target.textContent;
    });
    left.appendChild(button);
    if(i<4){
        var button = document.createElement('button');
        button.textContent = ops[i];
        button.className = 'button';
        button.addEventListener('click',function(e){
            output.textContent += e.target.textContent;
        });
        right.appendChild(button);
    }
}

var equals = document.createElement('button');
equals.textContent = '=';
equals.className = 'button';
equals.addEventListener('click',function(){
    output.textContent = eval(output.textContent);
});
right.appendChild(equals);