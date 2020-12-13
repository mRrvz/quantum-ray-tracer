const { createCanvas } = require('canvas');
const { Constants } = require('./constants.js');
const fs = require('fs');

class canvasBox
{
    constructor(canvas_name, res_x, res_y, scale)
    {
        this.canvas = createCanvas(Constants.res_full, Constants.res_full);
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

        if (Constants.color_plane == 'red')
        {
            this.ctx.fillStyle = 'rgb('+bright+','+0+','+0+')';
            this.ctx.globalCompositeOperation = 'source-over';
            this.color = [bright, 0, 0, 1];
        }
        else if (Constants.color_plane == 'green')
        {
            this.ctx.fillStyle = 'rgb('+0+','+bright+','+0+')';
            this.ctx.globalCompositeOperation = 'lighter';
            this.color = [0, bright, 0, 0.7];
        }
        else if (Constants.color_plane == 'blue')
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

class Images
{
    constructor() 
    {
        this.display_ground_truth = null;
        this.display_monte_carlo = null;
        this.display_qfull_res = null;
        this.display_qss = null;
        this.display_confidence = null;
        this.display_cwtable = null;
    }

    setup_canvases()
    {
        this.display_ground_truth = new canvasBox('display_ground_truth', Constants.res_tiles, Constants.res_tiles, Constants.res_aa);
        this.display_monte_carlo = new canvasBox('display_monte_carlo', Constants.res_tiles, Constants.res_tiles, Constants.res_aa);
        this.display_qfull_res = new canvasBox('display_qfull_res', Constants.res_tiles, Constants.res_tiles, 1);
        this.display_qss = new canvasBox('display_qss', Constants.res_tiles, Constants.res_tiles, Constants.res_aa);
        this.display_confidence = new canvasBox('display_confidence', Constants.res_tiles, Constants.res_tiles, Constants.res_aa);
        this.display_cwtable = new canvasBox('display_cwtable', Constants.res_tiles, Constants.res_tiles, Constants.res_aa);
    }

    save_images() 
    {
        this.display_ground_truth.to_png();
        this.display_monte_carlo.to_png();
        this.display_qfull_res.to_png();
        this.display_qss.to_png();
        this.display_confidence.to_png();
        this.display_cwtable.to_png();
    }
}

module.exports.Images = Images;