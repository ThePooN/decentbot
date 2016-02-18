var DiscordClient = require("discord.io");
var fs = require("fs");
var request = require("request");

// Globals
var discord;
var commands = {};
var plugins = {};
var loginConfig;
var permissions;
var commandPrefix = "!"; // todo

// API
var api = exports;
api.loadPlugin = loadPlugin;
api.unloadPlugin = unloadPlugin;
api.loadPlugins = loadPlugins;
api.callHook = callHook;
api.loadPermissions = loadPermissions;
api.runCommand = runCommand;

// Functions
function loadPluginConfig(name, callback) {
    fs.readFile("plugins/" + name + "/config.json", function(err, data) {
        if (!err) {
            if (callback) callback(JSON.parse(data));
            return;
        }

        fs.readFile("plugins/" + name + "/config.default.json", function(err, data) {
            if (err && callback) callback({});
            else if (callback) callback(JSON.parse(data));
        });
    });
}

function callHook(name, args, pluginName) {
    var hookMethod = "on" + name[0].toUpperCase() + name.substr(1);

    if (pluginName) {
        if (plugins[pluginName] && plugins[pluginName][hookMethod])
            plugins[pluginName][hookMethod].apply(null, args);
    } else {
        for (var i in plugins) callHook(name, args, i);
    }
}

function loadPlugin(name, callback) {
    // Unload first
    unloadPlugin(name, function() {
        console.log("Loading plugin '" + name + "'...");

        // Delete cache and load
        var scriptPath = "./plugins/" + name + "/index.js";
        delete require.cache[require.resolve(scriptPath)];
        var plugin = plugins[name] = require(scriptPath);

        // Plugin commands
        if (plugin.commands) {
            for (var commandName in plugin.commands) {
                if (commands[commandName])
                    throw "Error loading plugin '" + name + "'!"  +
                        "Command '" + commandName + "' already exists!";

                commands[commandName] = plugin.commands[commandName];
            }
        }

        // Load config
        loadPluginConfig(name, function(config) {
            if (plugin.config)
                for (var key in config)
                    plugin.config[key] = config[key];

            // Call load hook
            callHook("load", null, name);
            console.log("Plugin '" + name + "' was loaded!");
            if (callback) callback();
        });
    });
}

function unloadPlugin(name, callback) {
    if (!plugins[name]) {
        if (callback) callback();
        return;
    }

    console.log("Unloading plugin '" + name + "'...");

    // Call unload hook
    callHook("unload", null, name);

    // Plugin commands
    if (plugin.commands)
        for (var commandName in plugin.commands)
            delete commands[commandName];

    // Remove from list
    delete plugins[name];

    // Delete cache
    var scriptPath = "plugins/" + name + "/index.js";
    delete require.cache[require.resolve(scriptPath)];

    console.log("Plugin '" + name + "' was unloaded!");
    if (callback) callback();
}

function loadPlugins(callback) {
    console.log("Loading all plugins...");

    fs.readdir("plugins", function(err, folders) {
        if (err) throw "Error loading plugins: " + err;

        var loadedCount = 0;

        if (folders.length < 1) {
            console.warn("Looks like you don't have any plugins!");
            console.warn("Read the readme for instructions on how to get some.");
            if (callback) callback();
            return;
        }

        function pluginLoaded() {
            loadedCount++;

            if (loadedCount == folders.length) {
                console.log("Finished loading plugins!");
                if (callback) callback();
            }
        }

        for (var i = 0; i < folders.length; i++)
            loadPlugin(folders[i], pluginLoaded);
    });
}

function createDefaults(callback) {
    var stepsDone = 0;

    function stepDone() {
        stepsDone++;
        if (stepsDone == 3 && callback) callback();
    }

    function createConfigFiles() {
        fs.access("config/permissions.json", fs.R_OK, function(err) {
            if (err) fs.writeFile("config/permissions.json", "{}", stepDone);
            else stepDone();
        });

        fs.access("config/login.json", fs.R_OK, function(err) {
            if (err) {
                fs.writeFile("config/login.json", "{\n" +
                    '    "email": "decentbot",\n' +
                    '    "password": "decentbot"\n' +
                "}", stepDone);
            } else {
                stepDone();
            }
        });
    }

    fs.access("plugins", fs.R_OK, function(err) {
        if (err) fs.mkdir("plugins", stepDone);
        else stepDone();
    });


    fs.access("config", fs.R_OK, function(err) {
        if (err) fs.mkdir("config", createConfigFiles);
        else createConfigFiles();
    });
}

function loadLoginConfig(callback) {
    fs.readFile("config/login.json", function(err, data) {
        if (err) throw "Error loading login config: " + err;
        loginConfig = JSON.parse(data);
        if (callback) callback();
    });
}

function loadPermissions(callback) {
    fs.readFile("config/permissions.json", function(err, data) {
        if (err) throw "Error loading permissions: " + err;
        permissions = JSON.parse(data);
        if (callback) callback();
    });
}

function runCommand(args, context) {
    if (args.length < 1) return;
    if (commands[args[0]]) {
        console.log(context.username + " (" + context.userId + " @ " + context.channelId + " @ " +
            context.serverId + ") ran ", args);

        try {
            var result = commands[args[0]].func(args, context, function(msg) {
                // Callback reply
                discord.sendMessage({
                    to: context.channelId,
                    message: msg
                });
            });

            // Return reply
            if (result) {
                discord.sendMessage({
                    to: context.channelId,
                    message: result
                });
            }
        } catch (ex) {
            console.log("Error running command '" + args[0] + "'!", ex, ex.stack);
        }
    }
}

function parseCommand(message, context) {
    if (message.indexOf(" ") > 0) {
        var f = message.indexOf(" ");
        runCommand([message.substr(0, f), message.substr(f + 1)], context);
    } else {
        runCommand([message], context);
    }
}

function createDiscordClient() {
    console.log("Creating Discord client...");
    api.discord = discord = new DiscordClient({
        autorun: true,
        email: loginConfig.email,
        password: loginConfig.password
    });

    discord.on("ready", function() {
        console.log("Logged into Discord as", discord.username);
    });

    discord.on("message", function(username, userId, channelId, message) {
        var context = {
            username: username,
            userId: userId,
            channelId: channelId,
            serverId: discord.serverFromChannel(channelId)
        };

        callHook("message", [message, context]);

        // Is it a command?
        if (message.indexOf(commandPrefix) === 0)
            parseCommand(message.substr(commandPrefix.length), context);
    });

    discord.on("disconnected", function() {
        console.log("Discord connection lost! Reconnecting in 5 seconds");
        setTimeout(discord.connect, 5000);
    });
}

function init() {
    createDefaults(function() {
        loadLoginConfig(function() {
            loadPermissions(function() {
                loadPlugins(function() {
                    createDiscordClient();
                });
            });
        });
    });
}

init();
