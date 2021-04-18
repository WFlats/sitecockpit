sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/base/util/ObjectPath"
], function (JSONModel, Device, ObjectPath) {
	"use strict";

	return {
		createDeviceModel: function () {
			var oModel = new JSONModel(Device);
			oModel.setDefaultBindingMode("OneWay");
			return oModel;
		},

		createFLPModel: function () {
			var fnGetuser = ObjectPath.get("sap.ushell.Container.getUser"),
				bIsShareInJamActive = fnGetuser ? fnGetuser().isJamActive() : false,
				oModel = new JSONModel({
					isShareInJamActive: bIsShareInJamActive
				});
			oModel.setDefaultBindingMode("OneWay");
			return oModel;
		},

		createWorkModel: function () {
			var oWorkModel = new JSONModel({
				shifts: [],
				weekendDays: [],
				specialDates: []
			});

			oWorkModel.setDefaultBindingMode("OneWay");
			return oWorkModel;
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
		},

		createWorkforceClashModel: function () {
			var oWorkforceClashModel = new JSONModel({
				overlappingTasksOfCrews: [],
				overlappingTasksOfWorkers: []
			});

			oWorkforceClashModel.setDefaultBindingMode("OneWay");
			return oWorkforceClashModel;
		}
	};
});