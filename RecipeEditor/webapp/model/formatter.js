sap.ui.define([], function () {
	"use strict";

	return {
		/**
		 * Rounds the currency value to 2 digits
		 *
		 * @public
		 * @param {string} sValue value to be formatted
		 * @returns {string} formatted currency value with 2 digits
		 */
		currencyValue: function (sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(2);
		},

		threeDecimals: function (sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(3);
		},

		hoursToHoursMinutes: function (sHours) {
			var decimalTime = parseFloat(sHours);
			decimalTime = decimalTime * 60 * 60;
			var hours = Math.floor((decimalTime / (60 * 60)));
			decimalTime = decimalTime - (hours * 60 * 60);
			var minutes = Math.floor((decimalTime / 60));
			if (hours < 10) {
				hours = "0" + hours;
			}
			if (minutes < 10) {
				minutes = "0" + minutes;
			}
			return hours + ":" + minutes;
		},

		dhmFromMs: function (iMs) {
			var cd = 24 * 60 * 60 * 1000,
				ch = 60 * 60 * 1000,
				d = Math.floor(iMs / cd),
				h = Math.floor((iMs - d * cd) / ch),
				m = Math.round((iMs - d * cd - h * ch) / 60000),
				pad = function (n) {
					return n < 10 ? "0" + String(n) : String(n);
				};
			if (!iMs || iMs === 0) {
				return ["0", "00", "00"];
			}
			if (m === 60) {
				h++;
				m = 0;
			}
			if (h === 24) {
				d++;
				h = 0;
			}
			return [String(d), pad(h), pad(m)];
		},

		dhmFromMsAsString: function (iMs) {
			var cd = 24 * 60 * 60 * 1000,
				ch = 60 * 60 * 1000,
				d = Math.floor(iMs / cd),
				h = Math.floor((iMs - d * cd) / ch),
				m = Math.round((iMs - d * cd - h * ch) / 60000),
				pad = function (n) {
					return n < 10 ? "0" + n : n;
				};
			if (!iMs || iMs === 0) {
				return "00:00:00";
			}
			if (m === 60) {
				h++;
				m = 0;
			}
			if (h === 24) {
				d++;
				h = 0;
			}
			return [d, pad(h), pad(m)].join(":");
		},

		productivity: function (sQuantity, sDuration) {
			if (!sQuantity || !sDuration) {
				return "";
			}
			var mProductivity = sQuantity / sDuration;
			return parseFloat(mProductivity).toFixed(2);
		},

		productivityPerHead: function (sQuantity, sDuration, sCount) {
			if (!sQuantity || !sDuration || !sCount) {
				return "";
			}
			var mProductivity = sQuantity / sDuration / sCount;
			return parseFloat(mProductivity).toFixed(2);
		},

		productivityState: function (sProductivity, sQuantity, sDuration) {
			// sProductivity is the planned productivity
			if (!sProductivity || !sQuantity || !sDuration) {
				return "None";
			}
			var mProductivity = sQuantity / sDuration;
			if (mProductivity >= sProductivity) {
				return "Success";
			} else if (mProductivity >= 0.9 * sProductivity) {
				return "Warning";
			}
			return "Error";
		}
	};
});