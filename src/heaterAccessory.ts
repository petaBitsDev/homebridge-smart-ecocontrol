import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ExampleHomebridgePlatform } from './platform';
import http from 'http';
import { JSDOM } from "jsdom";

export class ExampleHeaterCoolerAccessory {
    private service: Service;

    heaterStates = {
        isOn: false,
        temperature: 20
    };

    constructor(
        private readonly platform: ExampleHomebridgePlatform,
        private readonly accessory: PlatformAccessory
    ) {
        // create a new Heater Cooler service
        this.service = this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'petaBits')
            .setCharacteristic(this.platform.Characteristic.Model, 'Smart EcoControl')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '1.0.0');

        this.service = this.accessory.getService(this.platform.Service.HeaterCooler) || this.accessory.addService(this.platform.Service.HeaterCooler);

        // create handlers for required characteristics
        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(this.handleActiveGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
            .onGet(this.handleCurrentHeaterCoolerStateGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
            .setProps({
                minValue: 1,
                maxValue: 1,
                validValues: [this.platform.Characteristic.TargetHeaterCoolerState.HEAT]
            })
            .onGet(this.handleTargetHeaterCoolerStateGet.bind(this))
            .onSet(this.handleTargetHeaterCoolerStateSet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .onGet(this.handleCurrentTemperatureGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
            .setProps({
                minValue: 17,
                maxValue: 21.9,
                minStep: 0.1
            })
            .onGet(this.getTemperature.bind(this))
            .onSet(this.setTemperature.bind(this));

        setInterval(() => {
            this.getDataFromHeater();
        }, this.platform.config.polling);
    }

    /**
     * Handle requests to get the current value of the "Active" characteristic
     */
    handleActiveGet() {
        this.platform.log.debug('Triggered GET Active');

        // set this to a valid value for Active
        switch (this.heaterStates.isOn) {
            case true:
                return this.platform.Characteristic.Active.ACTIVE
            case false:
                return this.platform.Characteristic.Active.INACTIVE
            default:
                return this.platform.Characteristic.Active.INACTIVE
        }
    }

    /**
     * Handle requests to set the "Active" characteristic
     */
    handleActiveSet(value) {
        this.platform.log.debug('Triggered SET Active:', value);
    }

    /**
     * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
     */
    handleCurrentHeaterCoolerStateGet() {
        this.platform.log.debug('Triggered GET CurrentHeaterCoolerState');

        // set this to a valid value for CurrentHeaterCoolerState
        if (this.heaterStates.isOn) {
            return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        }
        else return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }


    /**
     * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
     */
    handleTargetHeaterCoolerStateGet() {
        this.platform.log.debug('Triggered GET TargetHeaterCoolerState');

        // set this to a valid value for TargetHeaterCoolerState
        const currentValue = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;

        return currentValue;
    }

    /**
     * Handle requests to set the "Target Heater-Cooler State" characteristic
     */
    handleTargetHeaterCoolerStateSet(value) {
        this.platform.log.debug('Triggered SET TargetHeaterCoolerState:', value);
    }

    /**
     * Handle requests to get the current value of the "Current Temperature" characteristic
     */
    handleCurrentTemperatureGet() {
        this.platform.log.debug('Triggered GET CurrentTemperature');

        // set this to a valid value for CurrentTemperature
        const currentValue = this.heaterStates.temperature;

        return currentValue;
    }

    getTemperature() {
        this.platform.log.debug('Triggered GET HeatingThresholdTemperature');

        return this.heaterStates.temperature;
    }

    setTemperature(value) {
        this.platform.log.debug('Triggered SET HeatingThresholdTemperature');

        let request = http.get("http://" + this.platform.config.ip + "/cgi/consigne_piece.cgi?newConsignePiece=" + (value as number * 10), (res) => {
            if (res.statusCode !== 200) {
                this.platform.log.debug(`Did not get an OK from the server. Code: ${res.statusCode}`);
                res.resume();
                return false;
            }

            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = new JSDOM(data);
                    this.heaterStates.temperature = parsedData.window.document.querySelector("consigne_piece").textContent;

                    if (parsedData.window.document.querySelector("mode_piece").textContent == 4) {
                        this.heaterStates.isOn = false;
                    } else {
                        this.heaterStates.isOn = true;
                    }
                    this.platform.log.debug("Data is : ", this.heaterStates);
                } catch (e) {
                    return
                }
            });
        }).on('error', (e) => {
            this.platform.log.debug(`Got error: ${e.message}`);
        });
    }

    getDataFromHeater() {

        let request = http.get("http://" + this.platform.config.ip + "/xml/status-piece.xml", (res) => {
            if (res.statusCode !== 200) {
                this.platform.log.debug(`Did not get an OK from the server. Code: ${res.statusCode}`);
                res.resume();
                return;
            }

            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = new JSDOM(data);
                    this.heaterStates.temperature = parsedData.window.document.querySelector("consigne_piece").textContent;

                    if (parsedData.window.document.querySelector("mode_piece").textContent == 4) {
                        this.heaterStates.isOn = false;
                        this.handleActiveSet(false);
                    } else {
                        this.heaterStates.isOn = true;
                    }
                    this.platform.log.debug("Data is : ", this.heaterStates);
                    
                    this.handleActiveGet();
                    this.getTemperature();
                    this.handleCurrentHeaterCoolerStateGet();
                } catch (e) {
                    return
                }
            });
        }).on('error', (e) => {
            this.platform.log.debug(`Got error: ${e.message}`);
        });

    }

}