const gi = require('node-gtk')
const Gtk = gi.require('Gtk', '3.0')
const supersampling = require('./supersampling.js');


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
    
        this.button_go = Gtk.ToolButton.newFromStock(Gtk.STOCK_GO_UP);
        this.button_go.connect('clicked', this._simulate.bind(this));
    
        this.image = new Gtk.Image();
        this.vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });

        this.vbox.packStart(this.button_go, false, true, 0);
        this.vbox.packStart(this.image, true, false, 0);
        this._window.add(this.vbox)

        this._window.on('show', () => {
            Gtk.main()
        })

        this._window.on('destroy', () => Gtk.mainQuit());
        this._window.on('delete-event', () => false);
    }

    _simulate() 
    {
        supersampling.do_sample();
        this.image.setFromFile("output/display_qss.png");
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