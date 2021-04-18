sap.ui.define([], function () {
	"use strict";

	return {

		rateFormatter: function (sText) {
			if (!sText) {
				return Number("0.00");
			}
			return Number(sText);
		}
	};
});