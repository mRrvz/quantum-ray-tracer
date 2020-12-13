const fs = require('fs');

class Constants
{
    static res_full_bits    = 7;  // 9  
    static res_aa_bits      = 2;  // 3  
    static num_counter_bits = 4;  // 5  
    static accum_bits       = 13; // 13

    static res_full        = 1 << this.res_full_bits; 
    static res_aa          = 1 << this.res_aa_bits;  
    static res_tiles       = this.res_full / this.res_aa;

    static do_shortcut_qss = true;
    static do_monte_carlo = true;

    static color_planes = ['red', 'green', 'blue'];
    static color_plane = null;

    static total_fraction = 6 * this.res_tiles;
    static fraction_counter = 0;
    static fraction = 0;

    static progress_bar = null;
    static image_json = null;

    static read_image()
    {
        this.image_json = JSON.parse(fs.readFileSync('../config/example_01.json'));
    }

    static null_image()
    {
        this.image_json = null;
    }

    static null_fraction()
    {   
        this.fraction_counter = 0;
        this.fraction = 0;
    }

    static update_fraction()
    {
        this.fraction_counter++;
        this.fraction = this.fraction_counter / this.total_fraction;
        this.progress_bar.setFraction(this.fraction);
        var formatted = this.fraction * 100;
        console.log(`Processing ${formatted.toFixed(1)} / 100%`);
    }

    static async update_color_plane(new_color)
    {
        this.color_plane = new_color;
    }

    static update_full_bits(new_full_bits) 
    {
        this.res_full_bits = new_full_bits;
        this.res_full = 1 << this.res_full_bits;
        this.res_tiles = this.res_full / this.res_aa;
        this.total_fraction = 6 * this.res_tiles;
    }

    static update_aa_bits(new_aa_bits)
    {
        this.res_aa_bits = new_aa_bits;
        this.res_aa = 1 << this.res_aa_bits;
        this.res_tiles = this.res_full / this.res_aa;
        this.total_fraction = 6 * this.res_tiles;
    }
    
    static update_counter_bits(new_counter_bits)
    {
        this.num_counter_bits = new_counter_bits;
    }

    static update_accum_bits(new_accum_bits)
    {
        this.accum_bits = new_accum_bits;
    }
}

module.exports.Constants = Constants;