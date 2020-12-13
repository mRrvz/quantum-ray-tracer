const gi = require('node-gtk')
const Gtk = gi.require('Gtk', '3.0')
const fs = require('fs');
const supersampling = require('./supersampling.js');
const { Constants } = require('./constants.js');
const performance = require('perf_hooks').performance

class Application 
{
    constructor() 
    {
        Gtk.init();

        this.application = new Gtk.Application();

        this.application.connect('activate', this._onActivate.bind(this));
        this.application.connect('startup', this._onStartup.bind(this));
    }

    _buildUI() 
    {
        Gtk.init()

        this._window = new Gtk.Window({
            type : Gtk.WindowType.TOPLEVEL
        })

        this._window.setDefaultSize(600, 400);
        this._window.setResizable(true);
    
        this.button_go = new Gtk.Button();
        this.button_go.setLabel("Синтезировать изображение");
        this.button_go.connect('clicked', this._simulate.bind(this));
    
        this.info_label = new Gtk.Label();
        this.info_label.setLabel("Введите количество кубитов для: ");

        this.ideal_label = new Gtk.Label();
        this.qcc_label = new Gtk.Label();
        this.about_sumulation = new Gtk.Label();

        this.entry_subpixel_size = new Gtk.SpinButton();
        this.entry_subpixel_size.setRange(1, 6);
        this.entry_subpixel_size.setIncrements(1, 1);
        this.entry_subpixel_size.setValue(2);
        this.entry_subpixel_size.connect('changed', this._update_sim_info.bind(this));

        this.pixel_size_label = new Gtk.Label();
        this.pixel_size_label.setLabel("размера сабпикселя");

        this.entry_counter = new Gtk.SpinButton();
        this.entry_counter.setRange(1, 10);
        this.entry_counter.setIncrements(1, 1);
        this.entry_counter.setValue(4);
        this.entry_counter.connect('changed', this._update_sim_info.bind(this));

        this.counter_label = new Gtk.Label();
        this.counter_label.setLabel("глубины итераций УКА");

        this.entry_image_size = new Gtk.SpinButton();
        this.entry_image_size.setRange(1, 11);
        this.entry_image_size.setIncrements(1, 1);
        this.entry_image_size.setValue(7);
        this.entry_image_size.connect('changed', this._update_sim_info.bind(this));

        this.image_size_label = new Gtk.Label();
        this.image_size_label.setLabel("размера изображения");

        this.image_qss = new Gtk.Image();
        this.image_original = new Gtk.Image();

        this.from_file_label = new Gtk.Label();
        this.from_file_label.setLabel("Загрузить из файла: ")
        this.check_button = new Gtk.CheckButton();

        this.progress_bar = new Gtk.ProgressBar();
        Constants.progress_bar = this.progress_bar;

        this.container = new Gtk.Fixed();

        this.container.put(this.button_go, 5, 500);
        this.container.put(this.info_label, 5, 358);

        this.container.put(this.pixel_size_label, 130, 388);
        this.container.put(this.entry_subpixel_size, 5, 380);

        this.container.put(this.entry_counter, 5, 420);
        this.container.put(this.counter_label, 130, 428);

        this.container.put(this.entry_image_size, 5, 460);
        this.container.put(this.image_size_label, 130, 468);

        this.container.put(this.image_original, 10, 50);
        this.container.put(this.image_qss, 20 + Constants.res_full, 50);

        this.container.put(this.qcc_label, 0, 0);
        this.container.put(this.ideal_label, 0, 0);
        this.container.put(this.about_sumulation, 5, 568);
        
        this.container.put(this.from_file_label, 5, 548)
        this.container.put(this.check_button, 155, 548);

        this.progress_bar.setFraction(0);
        this._update_sim_info();

        this._window.add(this.container);

        this._window.on('show', () => {
            Gtk.main()
        })

        this._window.on('destroy', () => Gtk.mainQuit());
        this._window.on('delete-event', () => false);
    }

    _update_sim_info()
    {
        Constants.update_aa_bits(this.entry_subpixel_size.getValue());
        Constants.update_counter_bits(this.entry_counter.getValue());
        Constants.update_full_bits(this.entry_image_size.getValue());

        this.about_sumulation.setLabel(
            `Размер изображения: ${Constants.res_full} x ${Constants.res_full}.\n` +
            `Размер сабпикселя: ${Constants.res_aa} x ${Constants.res_aa}.\n` +
            `Глубина итераций УКА: ${Constants.num_counter_bits}.`
        );
    }

    _simulate() 
    {
        Constants.update_aa_bits(this.entry_subpixel_size.getValue());
        Constants.update_counter_bits(this.entry_counter.getValue());
        Constants.update_full_bits(this.entry_image_size.getValue());
        
        Constants.null_fraction();
        Constants.null_image();

        if (this.check_button.active)
        {
            Constants.read_image(); // from config?
        }

        this.container.move(this.image_qss, 20 + Constants.res_full, 50);
        this.progress_bar.setFraction(0);

        supersampling.do_sample();

        this.ideal_label.setLabel("1. Исходное изображение");
        this.qcc_label.setLabel("2. Квантовая избыточная выборка");
        this.container.move(this.qcc_label, 10, Constants.res_full + 75);
        this.container.move(this.ideal_label, 10, Constants.res_full + 60);

        this.image_qss.setFromFile("output/display_qss.png");
        this.image_original.setFromFile("output/display_qfull_res.png")
    }

    _onActivate() 
    {
        this._window.showAll();
    }

    _onStartup() 
    {
        this._buildUI();
    }
};

let app = new Application();
app.application.run();