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

		hoursMinutes: function (sHours, sMinutes) {
			var hours = sHours,
				minutes = sMinutes;

			if (sHours < 10) {
				hours = "0" + sHours;
			}
			if (sMinutes < 10) {
				minutes = "0" + sMinutes;
			}
			return hours + ":" + minutes;
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

		percentageWorked: function (productiveHours, shiftHours) {
			if (!productiveHours || !shiftHours || isNaN(shiftHours)) {
				return "";
			}
			return parseFloat(productiveHours / shiftHours * 100).toFixed(0);
		},

		percentageWorkedState: function (productiveHours, shiftHours) {
			// revisit: returning a string causes an error. but see https://sapui5.hana.ondemand.com/#/entity/sap.m.ObjectNumber/sample/sap.m.sample.Table/code/Formatter.js
			var mKPI;
			if (!productiveHours || !shiftHours || isNaN(shiftHours)) {
				return "None";
			}
			mKPI = productiveHours / shiftHours;
			if (mKPI >= 0.75) {
				return "Success";
			} else if (mKPI >= 0.50) {
				return "Warning";
			} else {
				return "Error";
			}
		}
	};
});