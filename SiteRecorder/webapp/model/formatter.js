sap.ui.define([
	"../controller/BaseController",
	"sap/ui/core/format/DateFormat"
], function (BaseController, DateFormat) {
	"use strict";

	return {

		numberUnit: function (sValue) {
			if (!sValue) {
				return "";
			}
			return parseFloat(sValue).toFixed(2);
		},

		numberDivision: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(sValue1 / sValue2).toFixed(3);
		},

		startDate: function (iStatus, sPlannedStart, sActualStart) {
			if (iStatus < 2) {
				return sPlannedStart;
			} else {
				return sActualStart;
			}
		},

		progress: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(sValue1 / sValue2 * 100).toFixed(2);
		},

		performance: function (sValue1, sValue2) {
			if (!sValue1 || !sValue2) {
				return "";
			}
			return parseFloat(sValue1 / sValue2).toFixed(2);
		},

		stateFormatter: function (KPI) {
			if (KPI === "") {
				return "None";
			}
			if (!KPI) {
				return "None";
			}
			if (KPI >= 1.0) {
				return "Success";
			} else if (KPI >= 0.9) {
				return "Warning";
			} else {
				return "Error";
			}
		},

		iconFormatter: function (KPI) {
			if (KPI >= 1.0) {
				return "sap-icon://status-positive";
			} else if (KPI >= 0.9) {
				return "sap-icon://status-critical";
			} else {
				return "sap-icon://status-negative";
			}
		},

		taskIconFormatter: function (iStatus) {
			var mIcon = "";
			switch (iStatus) {
			case 0: // planned
				mIcon = "sap-icon://pending";
				break;
			case 1: // committed
				mIcon = "sap-icon://navigation-right-arrow";
				break;
			case 2: // started
				mIcon = "sap-icon://process";
				break;
			case 3: // stopped
				mIcon = "sap-icon://stop";
				break;
			case 4: // completed
				mIcon = "sap-icon://media-forward";
				break;
			case 5: // approved
				mIcon = "sap-icon://accept";
				break;
			}
			return mIcon;
		},

		taskIconColorFormatter: function (sKPI) {
			var sColor = "#000000"; // Black
			if (sKPI >= 1) {
				sColor = "#008000"; // Green
			} else if (sKPI >= 0.9) {
				sColor = "#FFA500"; // Orange
			} else {
				sColor = "#FF0000"; // Red
			}
			return sColor;
		},

		statusButtonText: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = this.getResourceBundle().getText("buttonCommit");
				break;
			case 1: // committed
				sText = this.getResourceBundle().getText("buttonStart");
				break;
			case 2: // started
				sText = this.getResourceBundle().getText("buttonComplete");
				break;
			case 3: // stopped
				sText = this.getResourceBundle().getText("buttonComplete");
				break;
			case 4: // completed
				sText = this.getResourceBundle().getText("buttonApprove");
				break;
			case 5: // approved
				sText = this.getResourceBundle().getText("buttonApproved");
				break;
			}
			return sText;
		},

		startStopIconFormatter: function (iStatus) {
			var sIcon = "";
			if (iStatus === 2) {
				sIcon = "sap-icon://stop";
			} else if (iStatus === 3) {
				sIcon = "sap-icon://restart";
			}
			return sIcon;
		},

		statusButtonTooltip: function (iStatus) {
			var sText = "";
			switch (iStatus) {
			case 0: // planned
				sText = this.getResourceBundle().getText("committedButtonTooltip");
				break;
			case 1: // committed
				sText = this.getResourceBundle().getText("startButtonTooltip");
				break;
			case 2: // started
				sText = this.getResourceBundle().getText("completeButtonTooltip");
				break;
			case 3: // stopped
				sText = this.getResourceBundle().getText("completeButtonTooltip");
				break;
			case 4: // completed
				sText = this.getResourceBundle().getText("approveButtonTooltip");
				break;
			}
			return sText;
		},

		startStopButtonTooltip: function (iStatus) {
			var sText = "";
			if (iStatus === 2) {
				sText = "Stop the Task";
			} else if (iStatus === 3) {
				sText = "Restart the Task";
			}
			return sText;
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

		hoursMinutesToDecimalHours: function (sHoursMinutes) {
			var sHours = sHoursMinutes.slice(0, sHoursMinutes.indexOf(":")),
				sMinutes = sHoursMinutes.slice(sHoursMinutes.indexOf(":") + 1, sHoursMinutes.length);
			return parseFloat(Number(sHours) + Number(sMinutes) / 60).toFixed(3);
		}
	};
});