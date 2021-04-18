sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device"
], function (JSONModel, Device) {
	"use strict";

	return {

		createDeviceModel: function () {
			var oModel = new JSONModel(Device);
			oModel.setDefaultBindingMode("OneWay");
			return oModel;
		},

		createUserModel: function () {
			var oUserModel = new JSONModel({
				role: "",
				projectCode: "",
				email: "",
				app: ""
			});

			oUserModel.setDefaultBindingMode("OneWay");
			return oUserModel;
		}

	};
});