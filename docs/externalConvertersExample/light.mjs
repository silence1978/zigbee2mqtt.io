const exposes = require('zigbee-herdsman-converters/lib/exposes');
const fz = {
    ...require('zigbee-herdsman-converters/converters/fromZigbee'),
    legacy: require('zigbee-herdsman-converters/lib/legacy').fromZigbee
};
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const ota = require('zigbee-herdsman-converters/lib/ota');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const extend = require('zigbee-herdsman-converters/lib/extend');
const e = exposes.presets;
const ea = exposes.access;
const libColor = require('zigbee-herdsman-converters/lib/color');
const utils = require('zigbee-herdsman-converters/lib/utils');
const zosung = require('zigbee-herdsman-converters/lib/zosung');
const fzZosung = zosung.fzZosung;
const tzZosung = zosung.tzZosung;
const ez = zosung.presetsZosung;
const globalStore = require('zigbee-herdsman-converters/lib/store');
const {
    Buffer
} = require('buffer');
//function thresholdParser(v, statusLookup, stateLookup) {
// const buffer = Buffer.from(v, 'base64');
// return {
// status: tuya.valueConverterBasic.lookup(statusLookup).from(buffer[0]),
// state: tuya.valueConverterBasic.lookup(stateLookup).from(buffer[1]),
// value: (buffer[3] | buffer[2] << 8),
// };
//}

const valueConverter = {
    ...tuya.valueConverter,
    thresholdVariant1: (statusLookup, stateLookup) => {
        return {
            from: (v, meta) => {
                const buffer = Buffer.from(v, 'base64');
                meta.logger.debug(`TEST2: ${JSON.stringify(buffer)}`);
                return {
                    status: buffer[0], //tuya.valueConverterBasic.lookup(statusLookup).from(buffer[0]),
                    state: buffer[1], //tuya.valueConverterBasic.lookup(stateLookup).from(buffer[1]),
                    value: (buffer[3] | buffer[2] << 8),
                };
            },
            to: (v) => {
                const payload = [];
                payload.push(tuya.valueConverterBasic.lookup(statusLookup).to(v.status)/v.status);
                payload.push(tuya.valueConverterBasic.lookup(stateLookup).to(v.state)/v.state);
                payload.push(...tuya.convertDecimalValueTo2ByteHexArray(v.value));
                return payload;
            },
        };
    },
    thresholdVariant2: (names, statusLookup, stateLookup) => {
        return {
            from: (v, meta) => {
                const thresholds = {};
                const chunkSize = 4;
                meta.logger.debug(`TEST0: ${JSON.stringify(v)}`);
                for (const [i, name] of Object.entries(names)) {
                    const idx = i * chunkSize;
                    const thresholdPayload = v.slice(idx, idx + chunkSize);
                    meta.logger.debug(`TEST1: name: ${name}, idx: ${idx}, payload: ${JSON.stringify(thresholdPayload)}`);
                    thresholds[`${name}_threshold`] = valueConverter.thresholdVariant1(statusLookup, stateLookup).from(thresholdPayload, meta);
                }
                return thresholds;
            },
            to: (v) => {
                const payload = [];
                for (const threshold of Object.values(v)) payload.push(...valueConverter.thresholdVariant1(statusLookup, stateLookup).to(threshold));
                return payload;
            }
        };
    },
};
const tzDataPoints = {
    ...tuya.tz.datapoints,
    key: ['state', 'energy', 'breaker_id', 'voltage', 'current', 'power', 'status', 'value', 'thresholds', 'leakage_threshold', 'overcurrent_threshold', 'overvoltage_threshold', 'undervoltage_threshold', ],
};
const definition = {
    fingerprint: tuya.fingerprint('TS0601', ['_TZE204_a6r3dgts']),
    model: 'TS0601',
    vendor: 'TuYa',
    description: 'Zigbee DIN Circuit Breaker',
    fromZigbee: [tuya.fz.datapoints],
    toZigbee: [tzDataPoints],
    configure: tuya.configureMagicPacket,
    exposes: [tuya.exposes.switch(), e.energy(), e.power(), e.voltage(), e.current(),
        exposes.composite('Leakage threshold', 'leakage_threshold', ea.STATE)
        .withFeature(exposes.switch().withState('state', true, 'Toggle leakage threshold alarm', ea.STATE_SET))
        .withFeature(exposes.numeric('value', ea.STATE).withUnit('mA').withDescription('Value of trigger for leakage threshold'))
        .withDescription('Works only on 2P device'),
        exposes.composite('Thresholds', 'thresholds', ea.STATE_SET)
        .withFeature(exposes.composite('Overcurrent threshold', 'overcurrent_threshold', ea.STATE)
            .withFeature(exposes.switch().withState('state', true, 'Toggle overcurrent threshold alarm', ea.STATE_SET))
            .withFeature(exposes.numeric('value', ea.STATE_SET).withUnit('A').withValueMax(63).withValueMin(10).withValueStep(1)
                .withPreset('default', 35, 'Default value').withDescription('Value of trigger for overcurrent threshold')))
        .withFeature(exposes.composite('Overvoltage threshold', 'overvoltage_threshold', ea.STATE)
            .withFeature(exposes.switch().withState('state', true, 'Toggle overvoltage threshold alarm', ea.STATE_SET))
            .withFeature(exposes.numeric('value', ea.STATE_SET).withUnit('V').withValueMax(400).withValueMin(1).withValueStep(1)
                .withPreset('default', 265, 'Default value').withDescription('Value of trigger for overvoltage threshold')))
        .withFeature(exposes.composite('Undervoltage threshold', 'undervoltage_threshold', ea.STATE)
            .withFeature(exposes.switch().withState('state', true, 'Toggle undervoltage threshold alarm', ea.STATE_SET))
            .withFeature(exposes.numeric('value', ea.STATE_SET).withUnit('V').withValueMax(300).withValueMin(50).withValueStep(1)
                .withPreset('default', 180, 'Default value').withDescription('Value of trigger for undervoltage threshold'))),
        exposes.text('breaker_id', ea.STATE).withDescription('Device identificator from manufacturer'),
    ],
    meta: {
        tuyaDatapoints: [
            [1, 'energy', tuya.valueConverter.divideBy100],
            [6, null, tuya.valueConverter.phaseVariant2],
            [16, 'state', tuya.valueConverter.onOff],
            // {"type":"Buffer","data":[4,1,0,30]} - leakage enabled
            // {"type":"Buffer","data":[4,0,0,30]} - leakage disabled
            [17, 'leakage_threshold', valueConverter.thresholdVariant1({
                4: 4
            }, {
                'ON': 1,
                'OFF': 0
            })],
            //[17, 'leakage_threshold', valueConverter.threshold2],
            // {"type":"Buffer","data":[1,1,0,30,3,0,0,250,4,0,0,150]} - overcurr enabled 30A | overvolt enabled 250V | undervolt enabled 150V
            // {"type":"Buffer","data":[1,0,0,21,3,0,0,250,4,0,0,150]} - overcurr disabled 21A | overvolt disabled 250V | undervolt disabled 150V
            [18, 'thresholds', valueConverter.thresholdVariant2(['overcurrent', 'overvoltage', 'undervoltage'], {
                1: 1,
                3: 3,
                4: 4
            }, {
                'ON': 1,
                'OFF': 0
            })],
            //[18, 'overcurrent_threshold', valueConverter.thresholdVariant2([], {1: 1}, {'ON': 1, 'OFF': 0})],
            //[18, 'overvoltage_threshold', valueConverter.thresholdVariant2([], {3: 3}, {'ON': 1, 'OFF': 0})],
            //[18, 'undervoltage_threshold', valueConverter.thresholdVariant2([], {4: 4}, {'ON': 1, 'OFF': 0})],
            [19, 'breaker_id', tuya.valueConverter.raw],
        ],
    },
};

module.exports = definition;
