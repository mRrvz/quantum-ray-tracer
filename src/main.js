require('./src/qcengine_node.js');

qc = new QPU();

var x_bits = 3;           // The number of bits in the x coordinate
var z_bits = 0;           // The number of bits in the z (depth) coordinate
var color_bits = 2;       // The number of bits in an object's color
var num_objects = 2;      // How many objects we're going to use
var background_color = 0; 

var object_defs = [
                    {x1: 1, x2: 3, color: 2},
                    {x1: 2, x2: 5, color: 3} ];

var ray = {};
var scene = {};
var x_sign_bitmask = 1 << (x_bits - 1); 

function allocate_all()
{
    var bits_per_ray = x_bits + z_bits + color_bits;
    var bits_per_object = 2 * x_bits + z_bits + color_bits;
    var total_qubits = bits_per_ray + num_objects * bits_per_object;

    qc.reset(total_qubits);
    console.log(qc.num_qubits + 'flexin');
    qc.print('Using ' + total_qubits + ' qubits.\n' +'RAM est: ' + Math.pow(2, total_qubits + 3 -20) + ' MB.\n');

    ray.x = qc.new_qint(x_bits, 'ray.x');
    ray.length = qc.new_qint(z_bits, 'ray.length');
    ray.color = qc.new_qint(color_bits, 'ray.color');
    scene.objects = [];

    for (var i = 0; i < num_objects; ++i)
    {
        var obj = {};
        obj.x1 = qc.new_qint(x_bits, 'obj['+i+'].x1');
        obj.x2 = qc.new_qint(x_bits, 'obj['+i+'].x2');
        //obj.z = qint.new(z_bits, 'obj['+i+'].z');
        obj.color = qc.new_qint(color_bits, 'obj['+i+'].color');
        scene.objects.push(obj);
    }
}

function init_scene()
{
    for (var i = 0; i < num_objects; ++i)
    {
        var obj = scene.objects[i];
        var def = object_defs[i];
        obj.x1.write(def.x1);
        obj.x2.write(def.x2);
        //obj.z.write(def.z);
        obj.color.write(def.color);
    }
}

function ray_trace()
{
    for (var i = 0; i < num_objects; ++i)
    {
        var obj = scene.objects[i];
        //console.log(obj.x1.read() + ': ' + ray.x.read() + ' : ' + obj.x2.read());
        obj.x1.subtract(ray.x);
        obj.x1.subtract(1);
        //console.log(obj.x1.read());

        ray.x.subtract(obj.x2);
        ray.x.subtract(1);

        condition_mask = qintMask([obj.x1, x_sign_bitmask,ray.x, x_sign_bitmask]);
        ray.color.exchange(obj.color, -1, condition_mask);

        ray.x.add(obj.x2);
        ray.x.add(1);
    }
}

function do_brute_force_traces()
{
    var ray_count = 1 << x_bits;
    for (var i = 0; i < ray_count; ++i)
    {
        init_scene();
        ray.x.write(i);
        ray.color.write(background_color);
        ray_trace();
        console.log(ray.color.read());
    }
}

function tiny_trace(x, objects)
{
    console.log(x.phaseShift);
    qc.codeLabel('tiny-trace');
    for (var i = 0; i < objects.length; ++i)
    {
        x.not(~objects[i]);
        x.phaseShift(180);
        x.not(~objects[i]);
    }
}

function groverIteration(x)
{
    qc.codeLabel('Grover iteration');
    x.hadamard();
    x.not();
    x.phaseShift(180);
    x.not();
    x.hadamard();
}

//allocate_all();
//init_scene()
//ray.x.write(0);
//ray.x.hadamard();
//ray.color.write(background_color);
//ray_trace();
//tiny_trace(ray.x, scene.objects);
//console.log(ray.x.read());
//console.log(ray.color.read());


var x_bits = 3;   
var p_bits = 3;  
qc.reset(x_bits + p_bits);
var ray_x = qc.new_qint(x_bits, 'ray_x');
var counter = qc.new_qint(x_bits, 'counter');
var object_positions = [3, 5];
qc.write(0);
ray_x.hadamard();
tiny_trace(ray_x, object_positions);

//do_brute_force_traces();
//init_scene();
//ray.x.write(1);
//ray.color.write(background_color);
//ray_trace();
//qc.print('flexin' + ray.color.read() + '\n');
//do_brute_force_traces();
//console.log(ray.color.read());