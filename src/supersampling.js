require('../qcengine/qcengine_node.js');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { QPU } = require('../qcengine/qcengine_scriptpanel.js');


var res_full_bits    = 7;  // 9  
var res_aa_bits      = 2;  // 3  
var num_counter_bits = 4;  // 5  
var accum_bits       = 10; // 13 

var res_full        = 1 << res_full_bits; 
var res_aa          = 1 << res_aa_bits;  
var res_tiles       = res_full / res_aa; 

var qss_full_lookup_table = null;
var qss_count_to_hits = [];

var do_shortcut_qss = true; 
var do_monte_carlo  = true; 

var display_ground_truth = null;
var display_monte_carlo = null;
var display_qfull_res = null;
var display_qss = null;
var display_confidence = null;
var display_cwtable = null;

var color_planes = ['red', 'green', 'blue'];
var color_plane = null;

qc = new QPU();

function do_sample()
{
    setup_canvases();

    for (var c = 0; c < color_planes.length; ++c)
    {
        color_plane = color_planes[c];

        draw_reference_res_images();
        create_qss_lookup_table();
        do_qss_image();
        draw_confidence_map();
    }

    save_images();
}

function shader_quantum(qx, qy, tx, ty, qacc, condition, out_color)
{
    var num_bins = 16;
    var hbin = 0|(num_bins * tx / res_tiles);
    var vbin = 0|(num_bins * ty / res_tiles);

    var ball_pos = [4, 2];
    var ball_radius = 2;
    var is_ball = hbin >= (ball_pos[0] - ball_radius) && hbin < (ball_pos[0] + ball_radius)
                         && vbin >= (ball_pos[1] - ball_radius) && vbin < (ball_pos[1] + ball_radius);

    var is_sky = vbin == 2 || vbin == 3;
    var is_ground = vbin >= 4 && vbin < 8;

    if (color_plane == 'blue')
    {
        ball_radius = 9;
        is_ball = vbin < 4;
    }

    if (is_ball)
    {
        var tiles_per_bin = res_tiles / num_bins;
        var bx = ball_pos[0] * tiles_per_bin;
        var by = ball_pos[1] * tiles_per_bin;
        var br = ball_radius * tiles_per_bin * res_aa;

        var dx = tx - bx;
        var dy = ty - by;
            
        if (dx < 0) 
        {
            dx = -(dx + 1);
        }

        if (dy < 0) 
        {
            dy = -(dy + 1);
        }

        dx *= res_aa;
        dy *= res_aa;

        qacc.add(dx * dx + dy * dy - br * br);

        if (tx < bx)
        {
            qx.not();
        }

        if (ty < by)
        {
            qy.not();
        }

        for (var i = 0; i < dx; ++i)
        {
            qacc.addShifted(qx, 1);
        }

        for (var i = 0; i < dy; ++i)
        {
            qacc.addShifted(qy, 1);
        }

        qacc.addSquared(qx);
        qacc.addSquared(qy);

        var acc_sign_bit = 1 << (accum_bits - 1);
        var mask = qacc.bits(acc_sign_bit);

        if (color_plane == 'blue')
        {
            mask.orEquals(qy.bits(0x1));
        }

        mask.orEquals(condition);
        xor_color(null, mask, out_color);

        qacc.subtractSquared(qx);
        qacc.subtractSquared(qy);

        for (var i = 0; i < dx; ++i)
        {
            qacc.subtractShifted(qx, 1);
        }

        for (var i = 0; i < dy; ++i) 
        {
            qacc.subtractShifted(qy, 1);
        }

        qacc.subtract(dx * dx + dy * dy - br * br);

        if (tx < bx)
        {
            qx.not();
        }

        if (ty < by)
        {
            qy.not();
        }
    }

    if (is_sky && color_plane == 'green')
    {
        var stripe_size = res_full_bits - 3;
        var bmask = 1 << stripe_size;

        var mask = qacc.bits(bmask);
        mask.orEquals(condition);

        var ty_shift = res_aa_bits - 1;
        var qy_shift = res_full_bits - res_aa_bits - 4;
        var qx_shift = res_full_bits - res_aa_bits - 5;

        qx_shift = (qx_shift < 0) ? 0 : qx_shift;
        qy_shift = (qy_shift < 0) ? 0 : qy_shift;
        qacc.addShifted(ty, ty_shift);
        qacc.addShifted(qy, qy_shift);

        xor_color(null, mask, out_color);
        qacc.subtractShifted(ty, ty_shift);
        qacc.subtractShifted(qy, qy_shift);
    }

    if (is_ground)
    {
        if (color_plane == 'red')
        {
            qx.cnot(qy, 0x1);
            var mask = qx.bits(0x1);
            mask.orEquals(condition);
            xor_color(null, mask, out_color);
            qx.cnot(qy, 0x1);
        }
        else if (color_plane == 'blue')
        {
            qx.cnot(qy);
            var mask = qx.bits(0x3);
            mask.orEquals(condition);
            xor_color(null, mask, out_color);
            qx.cnot(qy);
        }

        var tile_shift = res_aa_bits;
        var y_offset = res_full >> 2;

        if (ty >= (res_tiles >> 1))
        {
            y_offset += res_full >> 1;
        }

        var x_offset = (res_full) >> 1;
        var left_side = (tx < (res_tiles >> 1));
        var slopes = [[1,0],[0,1],[0,2]]; 

        if (left_side)
        {
            slopes = [[0,0],[0,1],[0,2]];
        }

        for (var slope = 0; slope < slopes.length; ++slope)
        {
            var num = slopes[slope][0];
            var denom = slopes[slope][1];

            x_offset = 0;
            txx = tx % (res_tiles >> 1);

            if (left_side)
            {
                txx = (res_tiles >> 1) - txx;
                qx.not();
            }

            qacc.add((txx << (tile_shift + num)) - (x_offset << num));
            qacc.addShifted(qx, num);
            qacc.subtract((ty << (tile_shift + denom)) - (y_offset << denom));
            qacc.subtractShifted(qy, denom);

            var acc_sign_bit = 1 << (accum_bits - 1);
            var mask = qacc.bits(acc_sign_bit);

            mask.orEquals(condition);
            xor_color(null, mask, out_color);

            qacc.addShifted(qy, denom);
            qacc.add((ty << (tile_shift + denom)) - (y_offset << denom));
            qacc.subtractShifted(qx, num);
            qacc.subtract((txx << (tile_shift + num)) - (x_offset << num));

            if (left_side)
            {
                txx = (res_tiles >> 1) - txx;
                qx.not();
            }
        }

        for (var band = 0; band < 7; ++band)
        {
            var band_bit = 1 << (band + 1);

            qacc.subtract((ty << (tile_shift)) - (y_offset));
            qacc.subtract(qy);

            var acc_bit = qacc.bits(~(band_bit - 1));
            var mask = acc_bit;
            mask.orEquals(condition);
            xor_color(null, mask, out_color);

            qacc.add(qy);
            qacc.add((ty << (tile_shift)) - (y_offset));
        }
    }
}

function flip_n_terms(x, num_terms_to_flip, condition)
{
    for (var i = 0; i < num_terms_to_flip; ++i)
    {
        x.not(i);
        x.cphase(180, ~0, condition);
        x.not(i);
    }
}

function create_qss_lookup_table()
{
    qc.clearOutput();
    qc.disableAnimation();
    qc.disableRecording();

    qc.reset((res_aa_bits + res_aa_bits) + num_counter_bits);
    var qxy = qc.new_qint(res_aa_bits + res_aa_bits, 'qxy');
    var qcount = qc.new_qint(num_counter_bits, 'count');

    var num_subpixels = 1 << (res_aa_bits + res_aa_bits);
    qss_full_lookup_table = null;

    for (var hits = 0; hits <= num_subpixels; ++hits)
    {
        create_table_column(hits, qxy, qcount);
    }

    var cw = qss_full_lookup_table;
    qss_count_to_hits = [];

    for (var count = 0; count < cw.length; ++count)
    {
        var best_hits = 0;
        var best_prob = 0;

        for (var hits = 0; hits < cw[0].length; ++hits)
        {
            if (best_prob < cw[count][hits])
            {
                best_prob = cw[count][hits];
                best_hits = hits;
            }
        }

        qss_count_to_hits.push(best_hits);
    }

    if (qss_full_lookup_table && display_cwtable)
    {
        display_cwtable.setup(cw[0].length, cw.length, 16);

        for (var y = 0; y < cw.length; ++y)
        {
            for (var x = 0; x < cw[0].length; ++x)
            {
                display_cwtable.pixel(x, y, cw[y][x]);
            }
        }
    }
}

function draw_confidence_map()
{
    if (ideal_result && qss_raw_result)
    {
        var cw = qss_full_lookup_table;

        for (var ty = 0; ty < res_tiles; ++ty)
        {
            for (var tx = 0; tx < res_tiles; ++tx)
            {
                var qss_out = qss_raw_result[ty][tx];
                var row_total = 0;
                var row_max = 0;

                for (var x = 0; x < cw[0].length; ++x)
                {
                    row_total += cw[qss_out][x];

                    if (cw[qss_out][x] > row_max)
                    {
                        row_max = cw[qss_out][x];
                    }
                }

                display_confidence.pixel(tx, ty, row_max / row_total);
            }
        }
    }
}

function create_table_column(color, qxy, qcount)
{
    var num_subpixels = 1 << (res_aa_bits + res_aa_bits);

    var true_count = color;

    qc.write(0);
    qcount.hadamard();
    qxy.hadamard();

    for (var i = 0; i < num_counter_bits; ++i)
    {
        var reps = 1 << i;
        var condition = qcount.bits(reps);
        var mask_with_condition = qxy.bits().or(condition);

        for (var j = 0; j < reps; ++j)
        {
            flip_n_terms(qxy, true_count, condition);
            grover_iteration(qxy.bits(), mask_with_condition);
        }
    }

    invQFT(qcount);
    var table = [];

    for (var i = 0; i < (1 << num_counter_bits); ++i)
    {
        table.push(qcount.peekProbability(i));
    }

    if (qss_full_lookup_table == null)
    {
        qss_full_lookup_table = [];

        for (var i = 0; i < (1 << num_counter_bits); ++i)
        {
            qss_full_lookup_table.push([]);

            for (var j = 0; j < num_subpixels; ++j)
            {
                qss_full_lookup_table[i].push(0);
            }
        }
    }

    for (var col = 0; col < 1 << num_counter_bits; ++col)
    {
        qss_full_lookup_table[col][true_count] = table[col];
    }
}


var ideal_result = null;
var qss_raw_result = null;

function draw_reference_res_images()
{
    qc.clearOutput();
    qc.disableAnimation();
    qc.disableRecording();

    var bits = res_aa_bits;
    var disable_simulation = 30; // overload to disable
    var total_qubits = 2 * bits + accum_bits + 1 + disable_simulation; 
    qc.reset(total_qubits);

    var qx = qc.new_qint(bits, 'qx');
    var qy = qc.new_qint(bits, 'qy');
    var qacc = qc.new_qint(accum_bits, 'scratch');
    var color = qc.new_qint(1, 'color');

    qc.write(0);

    if (qacc)
    {
        qacc.write(0);
    }

    var num_monte_carlo_samples = (1 << num_counter_bits) - 1;
    var num_subpixels = res_aa * res_aa;
    var total_pixel_error = 0;
    var num_zero_error_pixels = 0;

    ideal_result = [];

    for (var ty = 0; ty < res_tiles; ++ty)
    {
        ideal_result.push([]);
        console.log('full-res row ' + ty + ' of ' + res_tiles);

        for (var tx = 0; tx < res_tiles; ++tx)
        {
            var tile_ideal_sum = 0;

            for (var y = 0; y < res_aa; ++y)
            {
                for (var x = 0; x < res_aa; ++x)
                {
                    qx.write(x);
                    qy.write(y);
                    color.write(0);
                    shader_quantum(qx, qy, tx, ty, qacc, null, color);

                    var subpixel_value = color.read();
                    var full_x = (tx << res_aa_bits) + x;
                    var full_y = (ty << res_aa_bits) + y;

                    display_qfull_res.pixel(full_x, full_y, subpixel_value);
                    tile_ideal_sum += subpixel_value;
                }
            }

            ideal_result[ty].push(tile_ideal_sum);
            display_ground_truth.pixel(tx, ty, tile_ideal_sum / num_subpixels);
            
            if (do_monte_carlo)
            {
                var tile_monte_carlo_sum = 0;

                for (var sample = 0; sample < num_monte_carlo_samples; ++sample)
                {
                    var x = random_int(res_aa);
                    var y = random_int(res_aa);

                    qx.write(x);
                    qy.write(y);
                    color.write(0);

                    shader_quantum(qx, qy, tx, ty, qacc, null, color);
                    tile_monte_carlo_sum += color.read();
                }

                display_monte_carlo.pixel(tx, ty, tile_monte_carlo_sum / num_monte_carlo_samples);
                var normalized_mc_sum = Math.round(num_subpixels * tile_monte_carlo_sum / num_monte_carlo_samples);
                var pixel_error = Math.abs(normalized_mc_sum - tile_ideal_sum);

                if (pixel_error)
                {
                    total_pixel_error += pixel_error;
                }
                else
                {
                    num_zero_error_pixels++;
                }
            }
        }
    }

    /* TODO: statistic
    if (do_monte_carlo)
    {
        var average_pixel_error_percent = Math.round(100 * total_pixel_error / (res_tiles * res_tiles * num_subpixels));
        var zero_error_pixels_percent = Math.round(100 * num_zero_error_pixels / (res_tiles * res_tiles));
    }
    */

    qc.qReg.disableSimulation = false;
}

function random_int(range)
{
    return Math.floor(Math.random() * range) % range;
}

function qss_tile(sp)
{
    if (do_shortcut_qss && ideal_result)
    {
        var cw = qss_full_lookup_table;
        var true_val = ideal_result[sp.ty][sp.tx];
        var total_prob = 0;

        for (var y = 0; y < cw.length; ++y) 
        {
            total_prob += cw[y][true_val];
        }

        var dice = Math.random() * total_prob;
        var qss_out = 0;
        var prob = 0;

        for (var y = 0; y < cw.length; ++y)
        {
            prob += cw[y][true_val];

            if (prob >= dice)
            {
                qss_out = y;
                break;
            }
        }

        sp.readVal = qss_out;
        sp.hits = qss_count_to_hits[sp.readVal];
        sp.color = sp.hits / (res_aa * res_aa);

        return sp.color;
    }

    sp.qx.write(0);
    sp.qy.write(0);
    sp.counter.write(0);

    sp.qx.hadamard();
    sp.qy.hadamard();
    sp.counter.hadamard();

    for (var cbit = 0; cbit < num_counter_bits; ++cbit)
    {
        var iters = 1 << cbit;
        var qxy_bits = sp.qx.bits().or(sp.qy.bits());
        var condition = sp.counter.bits(iters);
        var mask_with_condition = qxy_bits.or(condition);

        for (var i = 0; i < iters; ++i)
        {
            shader_quantum(sp.qx, sp.qy, sp.tx, sp.ty, sp.qacc, condition, sp.qcolor);
            grover_iteration(qxy_bits, mask_with_condition);
        }
    }

    invQFT(sp.counter);

    sp.readVal = sp.counter.read();
    sp.hits = qss_count_to_hits[sp.readVal];
    sp.color = sp.hits / (res_aa * res_aa);

    return sp.color;
}

function do_qss_image()
{
    qc.clearOutput();
    qc.disableAnimation();
    qc.disableRecording();
    qc.reset(2 * res_aa_bits + num_counter_bits + accum_bits);

    var sp = {};
    sp.qx = qc.new_qint(res_aa_bits, 'qx');
    sp.qy = qc.new_qint(res_aa_bits, 'qy');
    sp.counter = qc.new_qint(num_counter_bits, 'counter');
    sp.qacc = qc.new_qint(accum_bits, 'scratch');
    sp.qacc.write(0);

    var total_pixel_error = 0;
    var num_zero_error_pixels = 0;
    qss_raw_result = [];

    for (sp.ty = 0; sp.ty < res_tiles; ++sp.ty)
    {
        qss_raw_result.push([]);
        console.log('QSS row ' + sp.ty + ' of ' + res_tiles);

        for (sp.tx = 0; sp.tx < res_tiles; ++sp.tx)
        {
            qss_tile(sp);
            qss_raw_result[sp.ty].push(sp.readVal);
            display_qss.pixel(sp.tx, sp.ty, sp.color);

            if (ideal_result)
            {
                var pixel_error = Math.abs(sp.hits - ideal_result[sp.ty][sp.tx]);

                if (pixel_error)
                {
                    total_pixel_error += pixel_error;
                }
                else
                {
                    num_zero_error_pixels++;
                }
            }
        }
    }

    if (ideal_result)
    {
        var num_subpixels = res_aa * res_aa;
        var average_pixel_error_percent = Math.round(100 * total_pixel_error / (res_tiles * res_tiles * num_subpixels));
        var zero_error_pixels_percent = Math.round(100 * num_zero_error_pixels / (res_tiles * res_tiles));
    }
    else
    {
        // TODO
    }
}


function grover_iteration(mask, mask_with_condition)
{
    qc.label('Grover iteration');
    qc.hadamard(mask);
    qc.not(mask);
    qc.cphase(180, mask_with_condition);
    qc.not(mask);
    qc.hadamard(mask);
}

function invQFT(x)
{
    var bits = x.numBits;
    qc.label('inverse QFT');

    for (var i = 0; i < bits; ++i)
    {
        var bit1 = bits - (i + 1);
        var mask1 = 1 << bit1;
        x.hadamard(mask1);
        var theta = -90.0;

        for (var j = i + 1; j < bits; ++j)
        {
            var bit2 = bits - (j + 1);
            var mask2 = 1 << bit2;
            x.cphase(theta, mask1 + mask2);
            theta *= 0.5;
        }
    }
}

function setup_canvases()
{
    display_ground_truth = new canvasBox('display_ground_truth', res_tiles, res_tiles, res_aa);
    display_monte_carlo = new canvasBox('display_monte_carlo', res_tiles, res_tiles, res_aa);
    display_qfull_res = new canvasBox('display_qfull_res', res_tiles, res_tiles, 1);
    display_qss = new canvasBox('display_qss', res_tiles, res_tiles, res_aa);
    display_confidence = new canvasBox('display_confidence', res_tiles, res_tiles, res_aa);
    display_cwtable = new canvasBox('display_cwtable', res_tiles, res_tiles, res_aa);
}

function xor_color(qq, condition, out_color)
{
    if (qq)
    {
        if (out_color)
        {
            out_color.cnot(qq, ~0, condition);
        }
        else
        {
            qq.cphase(180, ~0, condition);
        }
    }
    else
    {
        if (out_color)
        {
            out_color.cnot(null, ~0, condition);
        }
        else
        {
            qc.cphase(180, condition);
        }
    }
}

function save_images() 
{
    display_ground_truth.to_png();
    display_monte_carlo.to_png();
    display_qfull_res.to_png();
    display_qss.to_png();
    display_confidence.to_png();
    display_cwtable.to_png();
}

class canvasBox
{
    constructor(canvas_name, res_x, res_y, scale)
    {
        this.canvas = createCanvas(res_full, res_full);
        this.ctx = this.canvas.getContext('2d');
        this.resolution_x = this.canvas.width;
        this.resolution_y = this.canvas.height;
        this.name = canvas_name;
        this.setup(res_x, res_y, scale);
    }

    clear()
    {
        this.ctx.fillStyle = '#afafdf';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    setup(resolution_x, resolution_y, ss_scale)
    {
        this.resolution_x = resolution_x;
        this.resolution_y = resolution_y;
        this.canvas.width = this.resolution_x * ss_scale;
        this.canvas.height = this.canvas.width * this.resolution_y / this.resolution_x;
    }

    pixel(x, y, color)
    {
        var bright = (255 * color).toFixed(0);
        var w = this.canvas.width / this.resolution_x;
        var h = this.canvas.height / this.resolution_y;
        var x1 = x * w;
        var y1 = y * h;

        this.color = null;

        if (color_plane == 'red')
        {
            this.ctx.fillStyle = 'rgb('+bright+','+0+','+0+')';
            this.ctx.globalCompositeOperation = 'source-over';
            this.color = [bright, 0, 0, 1];
        }
        else if (color_plane == 'green')
        {
            this.ctx.fillStyle = 'rgb('+0+','+bright+','+0+')';
            this.ctx.globalCompositeOperation = 'lighter';
            this.color = [0, bright, 0, 0.7];
        }
        else if (color_plane == 'blue')
        {
            this.ctx.fillStyle = 'rgb('+0+','+0+','+bright+')';
            this.ctx.globalCompositeOperation = 'lighter';
            this.color = [0, 0, bright, 0.7];
        }
        
        this.ctx.fillRect(x1, y1, w, h);
    }

    pixelRGB(x, y, color)
    {
        var inv_gamma = 1.0 / 2.2;
        var r = Math.pow(color[0], inv_gamma);
        var g = Math.pow(color[1], inv_gamma);
        var b = Math.pow(color[2], inv_gamma);

        r = (255 * r).toFixed(0);
        g = (255 * g).toFixed(0);
        b = (255 * b).toFixed(0);

        var w = this.canvas.width / this.resolution_x;
        var h = this.canvas.height / this.resolution_y;
        var x1 = x * w;
        var y1 = y * h;

        this.ctx.fillStyle = 'rgb('+r+','+g+','+b+')';
        this.ctx.fillRect(x1, y1, w, h);
    }

    to_png = function()
    {
        fs.writeFileSync('output/' + this.name + '.png', this.canvas.toBuffer());
    }
}

module.exports.do_sample = do_sample;
